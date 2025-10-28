#include "light.h"
#include "dashboard.h"
#include "wifi.h"
#include <MCP7940.h>

#include <sstream>

MCP7940_Class MCP7940;
char          inputBuffer[32];


namespace fg {


  static uint32_t rpm = 0;

  static void IRAM_ATTR rpm_counter() {
    rpm++;
  }

  std::unique_ptr<AutomationController> createController(Fridgecloud& cloud) {
    return std::unique_ptr<AutomationController>(new LightController(cloud));
  }

  LightController::LightController(Fridgecloud& cloud) :cloud(cloud), out_light(PIN_LIGHT, 0) {}

  void LightController::updateSensors() {

    float temperature, humidity;

    try {
      uint8_t tries = 0;
      for(; tries < 10; tries++) {
        if (sht.readSample()) {
          temperature = sht.getTemperature();
          humidity = sht.getHumidity();
          break;
        }
      }
      if(tries >= 10) {
        Serial.println("failed to read from sensor!!!");
        return;
      }
    }
    catch(...) {
      Serial.println("caught exception reading from sensor!!!");
      return;
    }

    state.temperature = temperature;
    state.humidity = humidity;
  }

  void LightController::checkDayCycle() {
    time_t now;
    struct tm * ptm;
    struct tm timeinfo;

    time(&now);
    ptm = gmtime ( &now );

    Serial.printf("[%02d:%02d:%02d] ", ptm->tm_hour, ptm->tm_min, ptm->tm_sec);

    state.timeofday = ptm->tm_sec + 60 * ptm->tm_min + 60 * 60 * ptm->tm_hour;

    if(settings.day > settings.night) {
      state.is_day = state.timeofday > settings.day || state.timeofday < settings.night;
    }
    else if(settings.day < settings.night) {
      state.is_day = state.timeofday > settings.day && state.timeofday < settings.night;
    }
    else {
      state.is_day = false;
    }
  }

  void LightController::fastloop() {
  }

  void LightController::loop() {

  try {
    updateSensors();
    checkDayCycle();

    if(settings.mqttcontrol) {
      Serial.println("Direct control mode active");;

      if(directmode_timer < xTaskGetTickCount()) {
        Serial.println("DIRECTMODE TIMEOUT! REVERTING!");
        auto saved_settings = fg::settings().getStr("config");
        loadSettings(saved_settings.c_str());
      }
    }
    else {
      controlLight();
    }


    Serial.printf("%s T:%.2f°C H:%.0f%% L:%.0f\n\r",
      state.is_day ? "DAY" : "NIGHT", state.temperature, state.humidity, state.out_light);

    DynamicJsonDocument status(1024);
    status["sensors"]["temperature"] = state.temperature;
    status["sensors"]["humidity"] = state.humidity;
    status["outputs"]["light"] = state.out_light;

    cloud.updateStatus(status);
  }
  catch(...) {
    Serial.println("Exception in control function!");
  }

  if (sntp_get_sync_status()) {
    printf("got time from sntp server\n");
    time_t now;
    struct tm timeinfo;
    time(&now);
    localtime_r(&now, &timeinfo);
    MCP7940.adjust(now);
  }
}

void LightController::saveAndUploadSettings() {
    DynamicJsonDocument doc(2048);

    doc["day"] = settings.day;
    doc["night"] = settings.night;
    doc["max_temperature"] = settings.max_temperature;
    doc["sunrise"] = settings.sunrise;
    doc["sunset"] = settings.sunset;
    doc["limit"] = settings.limit;

    std::stringstream stream;
    serializeJson(doc, stream);

    Serial.println(stream.str().c_str());
    fg::settings().setStr("config", stream.str().c_str());
    fg::settings().commit();
    cloud.updateConfig(stream.str().c_str());
}

  void LightController::controlLight() {
    const int SECONDS_PER_DAY = 24 * 60 * 60;

    if(state.is_day) {

      static float light_current = 0.0f;

      float out = 1.0f - (state.temperature - settings.max_temperature) / LIGHT_TEMP_HYST;

      float max_out = 1.0f;
      if((state.timeofday + SECONDS_PER_DAY) < (settings.day + SECONDS_PER_DAY + settings.sunrise * 60)) {
        //LOG("TON: %d\n", state.time - settings.daynight.day);
        max_out = static_cast<float>(state.timeofday - settings.day) / (settings.sunrise * 60.0f);
      }
      if((state.timeofday + SECONDS_PER_DAY) > (settings.night + SECONDS_PER_DAY - settings.sunset * 60)) {
        //LOG("TOFF: %d\n", state.time - settings.daynight.night);
        max_out = static_cast<float>(settings.night - state.timeofday) / (settings.sunset * 60.0f);
      }

      out = out > 1 ? 1 : out;
      out = out < 0 ? 0 : out;

      Serial.printf("OUT: %f\n\r", out);

      light_current = (1.0f - LIGHT_CONTROL_SPEED) * light_current + LIGHT_CONTROL_SPEED * out;

      //LOG("LIGHT: %f, %f, %f\n", out, light_current, max_out);

      if(light_current > max_out) {
        light_current = max_out;
      }

      light_current = light_current > 1.0f ? 1.0f : light_current;
      light_current = light_current < 0.0f ? 0.0f : light_current;

      light_current = light_current > (settings.limit / 100.0f) ? (settings.limit / 100.0f) : light_current;

      state.out_light = light_current * 100.0f;
      out_light.set(255.0f * light_current);
    }
    else {
      state.out_light = 0;
      out_light.set(state.out_light);
    }
  }

  void LightController::initStatusMenu(UserInterface* ui) {
    ui->push<Dashboard>(&state.temperature, &state.humidity, &state.out_light, &state.is_day)
    ->onEnter([ui, this](){
      initSettingsMenu(ui);
    });
  }

  void LightController::initSettingsMenu(UserInterface* ui) {

    auto menu = ui->push<SelectMenu>();

    menu->addOption("Dashboard", ICON_DASHBOARD, [ui, this](){ ui->pop(); });

    menu->addOption("System Time (UTC)", ICON_DAY, [ui, this](){
      ui->push<TimeEntry>("System Time (UTC)", state.timeofday, [ui, this](uint32_t value) {
        struct timeval time_now;
        time_now.tv_sec = value;
        time_now.tv_usec = 0;
        settimeofday(&time_now, NULL);

        int hours = value / 3600;
        int minutes = (value - hours * 3600) / 60;
        DateTime now(2000, 1, 1, hours, minutes);
        MCP7940.adjust(now);
        ui->pop();
      });
    });

    menu->addOption("Dayrise", ICON_DAY, [ui, this](){
      ui->push<TimeEntry>("Dayrise", settings.day, [ui, this](uint32_t value) {
        settings.day = value;
        saveAndUploadSettings();
        ui->pop();
      });
    });

    menu->addOption("Nightfall", ICON_NIGHT, [ui, this](){
      ui->push<TimeEntry>("Nightfall", settings.night, [ui, this](uint32_t value) {
        settings.night = value;
        saveAndUploadSettings();
        ui->pop();
      });
    });

    menu->addOption("Power Limit", ICON_DAY, [ui, this](){
      ui->push<FloatInput>("Power Limit", settings.limit, "%", 0, 100, 5, 0, [ui, this](float value) {
        settings.limit = value;
        saveAndUploadSettings();
        ui->pop();
      });
    });

    menu->addOption("Overheat Protection", ICON_TEMPERATURE, [ui, this](){
      ui->push<FloatInput>("Overheat Protection", settings.max_temperature, "C", 0, 40, 1, 0, [ui, this](float value) {
        settings.max_temperature = value;
        saveAndUploadSettings();
        ui->pop();
      });
    });

    menu->addOption("Sunrise", ICON_DAY, [ui, this](){
      ui->push<FloatInput>("Sunrise", settings.sunrise, "min", 0, 60, 1, 0, [ui, this](float value) {
        settings.sunrise = value;
        saveAndUploadSettings();
        ui->pop();
      });
    });

    menu->addOption("Sunset", ICON_NIGHT, [ui, this](){
      ui->push<FloatInput>("Sunset", settings.sunset, "min", 0, 60, 1, 0, [ui, this](float value) {
        settings.sunset = value;
        saveAndUploadSettings();
        ui->pop();
      });
    });

    menu->addOption("WiFi Connection", ICON_WIFI_FULL, [ui, this](){
      showWifiUi(ui, &cloud);
    });
  }

  void LightController::init() {
    Wire.begin(PIN_SDA, PIN_SCL);
    Wire1.begin(PIN_SENSOR_I2CSDA, PIN_SENSOR_I2CSCL, SENSOR_I2C_FRQ);
    delay(100);

    while (!MCP7940.begin()) {  // Initialize RTC communications
      Serial.println(F("Unable to find MCP7940N. Checking again in 3s."));  // Show error and wait
      delay(3000);
    }  // of loop until device is located
    Serial.println(F("MCP7940N initialized."));
    if (MCP7940.getPowerFail()) {  // Check for a power failure
      Serial.println(F("Power failure mode detected!\n"));
      Serial.print(F("Power failed at   "));
      DateTime now = MCP7940.getPowerDown();                      // Read when the power failed
      sprintf(inputBuffer, "....-%02d-%02d %02d:%02d:..",         // Use sprintf() to pretty print
              now.month(), now.day(), now.hour(), now.minute());  // date/time with leading zeros
      Serial.println(inputBuffer);
      Serial.print(F("Power restored at "));
      now = MCP7940.getPowerUp();                                 // Read when the power restored
      sprintf(inputBuffer, "....-%02d-%02d %02d:%02d:..",         // Use sprintf() to pretty print
              now.month(), now.day(), now.hour(), now.minute());  // date/time with leading zeros
      Serial.println(inputBuffer);
      MCP7940.clearPowerFail();  // Reset the power fail switch

    } else {
      while (!MCP7940.deviceStatus()) {  // Turn oscillator on if necessary
        Serial.println(F("Oscillator is off, turning it on."));
        bool deviceStatus = MCP7940.deviceStart();  // Start oscillator and return state
        if (!deviceStatus) {                        // If it didn't start
          Serial.println(F("Oscillator did not start, trying again."));  // Show error and
          delay(1000);                                                   // wait for a second
        }                // of if-then oscillator didn't start
      }                  // of while the oscillator is off
      if (!MCP7940.getBattery()) {  // Check if successful
        MCP7940.setBattery(true);     // enable battery backup mode
      }                        // if-then battery mode couldn't be set
    }                          // of if-then-else we have detected a priorpower failure

    DateTime now = MCP7940.now();
    sprintf(inputBuffer, "....-%02d-%02d %02d:%02d:..",         // Use sprintf() to pretty print
    now.month(), now.day(), now.hour(), now.minute());  // date/time with leading zeros
    Serial.println(inputBuffer);
    timeval epoch = {(time_t)now.unixtime(), 0};
    settimeofday((const timeval*)&epoch, 0);

    sntp_setoperatingmode(SNTP_OPMODE_POLL);
    sntp_setservername(0, "pool.ntp.org");
    sntp_init();

    if (sht.init(Wire1)) {
        Serial.print("init(): success\n");
    } else {
        Serial.print("init(): failed\n");
    }
    sht.setAccuracy(SHTSensor::SHT_ACCURACY_MEDIUM); // only supported by SHT3x

    auto saved_settings = fg::settings().getStr("config");
    loadSettings(saved_settings.c_str());

    cloud.onConfig([&](const String & payload) {

      Serial.println("received settings from cloud");

      loadSettings(payload);

      if(settings.mqttcontrol) {
        directmode_timer = xTaskGetTickCount() + DIRECTMODE_TIMEOUT;
      }
      else {
        fg::settings().setStr("config", payload.c_str());
        fg::settings().commit();
      }

      loop();

    });

    cloud.onControl([&](std::pair<std::string, std::string> output) {
      if(settings.mqttcontrol) {
        if(output.first == std::string("light")) {
          state.out_light = atof(output.second.c_str());
          out_light.set(2.55f * state.out_light);
        }
      }
    });

    cloud.onCommand([&](const JsonDocument& command) {
      // if(command["action"] && command["action"] == std::string("test")) {
      //   testmode_duration = TESTMODE_MAX_DURATION;
      // }
      // else if(command["action"] && command["action"] == std::string("stoptest")) {
      //   testmode_duration = 0;
      // }
    });
  }

  template<class T> inline void loadIfAvaliable(T& val, DynamicJsonDocument doc) {
    if(!doc.isNull()) {
      val = doc.as<T>();
    }
    else {
      Serial.println("error loading settings field");
    }
  }

  template<> inline void loadIfAvaliable(String& val, DynamicJsonDocument doc) {
    if(!doc.isNull()) {
      val = doc.as<const char*>();
    }
    else {
      Serial.println("error loading settings field");
    }
  }

  void LightController::loadSettings(const String& settings_json) {
    LightControllerSettings new_settings;
    DynamicJsonDocument doc(2048);
    DeserializationError error = deserializeJson(doc, settings_json);

    // Test if parsing succeeds.
    if (error) {
      Serial.println("error parsing settings json");
      settings = new_settings;
    }
    else {
      Serial.println(settings_json);

      loadIfAvaliable(new_settings.mqttcontrol, doc["mqttcontrol"]);
      loadIfAvaliable(new_settings.day, doc["day"]);
      loadIfAvaliable(new_settings.night, doc["night"]);
      loadIfAvaliable(new_settings.max_temperature, doc["max_temperature"]);
      loadIfAvaliable(new_settings.limit, doc["limit"]);
      loadIfAvaliable(new_settings.sunrise, doc["sunrise"]);
      loadIfAvaliable(new_settings.sunset, doc["sunset"]);

    }

    Serial.printf("#################################################\n\r");
    Serial.printf("new_settings.day:             %d\n\r", new_settings.day);
    Serial.printf("new_settings.night:           %d\n\r", new_settings.night);
    Serial.printf("new_settings.max_temperature: %.2f\n\r", new_settings.max_temperature);
    Serial.printf("new_settings.limit:           %.0f\n\r", new_settings.limit);
    Serial.printf("new_settings.sunrise:         %.0f\n\r", new_settings.sunrise);
    Serial.printf("new_settings.sunset:          %.0f\n\r", new_settings.sunset);
    Serial.printf("#################################################\n\r");

    settings = new_settings;
  }

}