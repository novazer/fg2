#include "dryer.h"
#include "dashboard.h"
#include "wifi.h"
#include <MCP7940.h>
#include <sstream>

#include "time.h"
#include "esp_sntp.h"

const uint8_t  SPRINTF_BUFFER_SIZE{32};
MCP7940_Class MCP7940;
char          inputBuffer[32];

static double ntcToTemp(uint16_t adc_val) {
  double R1 = 100000.0;   // voltage divider resistor value
  double Beta = 4250.0;  // Beta value
  double To = 298.15;    // Temperature in Kelvin for 25 degree Celsius
  double Ro = 100000.0;   // Resistance of Thermistor at 25 degree Celsius

  double adc_max = 4095.0;

  auto Rt = R1 * (double)adc_val / (adc_max - (double)adc_val);

  auto T = 1/(1/To + log(Rt/Ro)/Beta);    // Temperature in Kelvin
  auto Tc = T - 273.15;                   // Celsius
  return Tc;
}

namespace fg {

  std::unique_ptr<AutomationController> createController(Fridgecloud& cloud) {
    return std::unique_ptr<AutomationController>(new DryerController(cloud));
  }

  void DryerController::checkDayCycle() {
    time_t now;
    struct tm * ptm;
    struct tm timeinfo;

    time(&now);
    ptm = gmtime ( &now );

    Serial.printf("[%02d:%02d:%02d] ", ptm->tm_hour, ptm->tm_min, ptm->tm_sec);

    state.timeofday = ptm->tm_sec + 60 * ptm->tm_min + 60 * 60 * ptm->tm_hour;
  }

  void DryerController::updateSensors() {

    float temperature_sht, humidity_sht;
    char errorString[200];
    uint8_t error;

    bool sht_valid = false;
    static unsigned sht_fails = 0;

    Wire.flush();

    uint8_t tries = 0;
    for(; tries < 2; tries++) {
      if (sht21.readSample()) {
        temperature_sht = sht21.getTemperature();
        humidity_sht = sht21.getHumidity();
        humidity_sht = humidity_sht > 100.0 ? 100.0 : humidity_sht;
        sensors_valid = true;
        break;
      }
    }
    if(tries >= 2) {
      Serial.println("failed to read from temperature/humidity sensor!!!");
      sht_fails++;
    }
    else {
      sht_valid = true;
      sht_fails = 0;
    }


    Wire.flush();


    auto ntc1 = analogRead(PIN_NTC1);
    auto ntc2 = analogRead(PIN_NTC2);
    auto ntc3 = analogRead(PIN_NTC3);
    auto ntc4 = analogRead(PIN_NTC4);

    Serial.printf("NTCS: %2f %2f %2f %2f\n\r", ntcToTemp(ntc1), ntcToTemp(ntc2), ntcToTemp(ntc3), ntcToTemp(ntc4));
    Serial.printf("RAW: %u %u %u %u\n\r", ntc1, ntc2, ntc3, ntc4);

    heater_temp = ntcToTemp(ntc1);
    heater_temp = ntcToTemp(ntc2) > heater_temp ? ntcToTemp(ntc2) : heater_temp;
    heater_temp = ntcToTemp(ntc3) > heater_temp ? ntcToTemp(ntc3) : heater_temp;
    heater_temp = ntcToTemp(ntc4) > heater_temp ? ntcToTemp(ntc4) : heater_temp;

    if(sht_valid) {
      state.humidity = humidity_sht;
      state.temperature = temperature_sht;
    }

    if(sht_fails >= 10 && !sensor_fail_logged) {
      cloud.log("message-ext-sensor-fail");
      sensor_fail_logged = true;
      sensors_valid = false;
    }
    else {
      sensor_fail_logged = false;
    }
  }

  void DryerController::controlDehumidifier() {
    humidity_avg.push(state.humidity);

    float target_humidity = settings.humidity;
    float target_temperature = settings.temperature;
    float temp_limit = target_temperature - 1;

    static uint8_t dehumidify = 0;
    static uint8_t temperature_override = 1;
    static uint32_t turn_off_time = 0;

    if(state.temperature < temp_limit) {
      temperature_override = 0;
    }
    if(state.temperature > temp_limit + 1) {
      temperature_override = 1;
    }

    if(dehumidify) {
      if(humidity_avg.avg() < target_humidity) {
        dehumidify = 0;
      }
    }
    else {
      if(state.humidity > (target_humidity + 5.0)) {
        dehumidify = 1;
        humidity_avg.clear();
      }
    }
    if(dehumidify && temperature_override) {
      if(state.timeofday - turn_off_time > MINIMAL_DEHUMIDIFIER_OFF_TIME) {
        state.out_dehumidifier = 1;
      }
    }
    else {
      if(state.out_dehumidifier) {
        turn_off_time = state.timeofday;
      }
      state.out_dehumidifier = 0;
    }

    if(state.out_dehumidifier) {
      out_dehumidifier.set(1);
      out_fan_backwall.set(fridge_on_fanspeed);
    }
    else {
      out_dehumidifier.set(0);
      out_fan_backwall.set(fridge_off_fanspeed);
    }
  }


  void DryerController::controlHeater() {

    state.out_heater = heater_night_pid.tick(state.temperature, settings.temperature);
    heater_turn_off = (float)xTaskGetTickCount() + (float)configTICK_RATE_HZ * state.out_heater;

    if(heater_temp < HEATER_MAX_TEMPERATURE) {
      out_heater.set(1);
    }
    else {
      out_heater.set(0);
      Serial.println("HEATER THROTTLING!");
    }

    heater_avg.push(heater_temp);
    auto fanramp = (heater_avg.avg() - HEATER_FANRAMP_START_TEMP) / (HEATER_FANRAMP_END_TEMP - HEATER_FANRAMP_START_TEMP);
    fanramp = fanramp < 0 ? 0 : fanramp > 1.0 ? 1.0 : fanramp;
    unsigned fanspeed = settings.fans.internal * 2.55 + fanramp * (255 - settings.fans.internal * 2.55);
    Serial.printf("HEATER FANSPEED: %u\n\r", fanspeed);
    out_fan_internal.set(fanspeed);
  }

  DryerController::DryerController(Fridgecloud& cloud) :
    cloud(cloud),
    out_heater(PIN_HEATER),
    out_dehumidifier(PIN_DEHUMIDIFIER),
    out_light(PIN_LIGHT, 0),
    out_fan_internal(PIN_FAN_INTERNAL, 1, 0, 30000),
    out_fan_external(PIN_FAN_EXTERNAL, 2, 0, 30000),
    out_fan_backwall(PIN_FAN_BACKWALL, 3, 0, 30000),
    heater_day_pid(HEATER_PID_P, HEATER_PID_I, HEATER_PID_D),
    heater_night_pid(HEATER_PID_P, HEATER_PID_I, HEATER_PID_D),
    sht21(SHTSensor::SHTSensorType::SHT4X)
  {

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

  void DryerController::loadSettings(const String& settings_json) {
    DryerControllerSettings new_settings;
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
      loadIfAvaliable(new_settings.workmode, doc["workmode"]);
      loadIfAvaliable(new_settings.temperature, doc["temperature"]);
      loadIfAvaliable(new_settings.humidity, doc["humidity"]);
      loadIfAvaliable(new_settings.fans.external, doc["fans"]["external"]);
      loadIfAvaliable(new_settings.fans.internal, doc["fans"]["internal"]);
    }

    Serial.printf("#################################################\n\r");
    Serial.printf("new_settings.workmode: %s\n\r", new_settings.workmode);
    Serial.printf("new_settings.temperature: %.2f\n\r", new_settings.temperature);
    Serial.printf("new_settings.humidity: %.0f\n\r", new_settings.humidity);
    Serial.printf("new_settings.fans.external: %f\n\r", new_settings.fans.external);
    Serial.printf("new_settings.fans.internal: %f\n\r", new_settings.fans.internal);
    Serial.printf("#################################################\n\r");

    settings = new_settings;
  }

  void DryerController::saveAndUploadSettings() {
    DynamicJsonDocument doc(2048);

    doc["workmode"] = settings.workmode;
    doc["temperature"] = settings.temperature;
    doc["humidity"] = settings.humidity;
    doc["fans"]["external"] = settings.fans.external;
    doc["fans"]["internal"] = settings.fans.internal;


    std::stringstream stream;
    serializeJson(doc, stream);

    Serial.println(stream.str().c_str());
    fg::settings().setStr("config", stream.str().c_str());
    fg::settings().commit();
    cloud.updateConfig(stream.str().c_str());
  }

  void DryerController::init() {
    char errorString[200];
    uint8_t errorcode;

    pinMode(12, INPUT);
    pinMode(13, INPUT);
    pinMode(15, INPUT);
    pinMode(26, INPUT);

    pinMode(PIN_NTC1, INPUT);
    pinMode(PIN_NTC2, INPUT);
    pinMode(PIN_NTC3, INPUT);
    pinMode(PIN_NTC4, INPUT);

    auto saved_settings = fg::settings().getStr("config");
    loadSettings(saved_settings.c_str());

    cloud.onConfig([&](const String & payload) {
      Serial.println("received new configuration");
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

    cloud.onCommand([&](const JsonDocument& command) {
    });

    cloud.onUpdate([&](bool updating) {
      if(updating) {
        out_heater.set(0);
        out_dehumidifier.set(0);
        out_light.set(0);
      }
    });

    cloud.onControl([&](std::pair<std::string, std::string> output) {
      if(settings.mqttcontrol) {
        if(output.first == std::string("heater")) {
          testmode_heater_power = atof(output.second.c_str());
          state.out_heater = testmode_heater_power;
        }
        if(output.first == std::string("dehumidifier")) {
          auto dehumidifier = atoi(output.second.c_str());
          state.out_dehumidifier = dehumidifier;
          out_dehumidifier.set(dehumidifier);
        }

        if(output.first == std::string("fan-internal")) {
          auto fan = atof(output.second.c_str()) * 255.0f;
          directmode_fan_internal = fan;
        }
        if(output.first == std::string("fan-external")) {
          auto fan = atof(output.second.c_str()) * 255.0f;
          out_fan_external.set(fan);
        }
        if(output.first == std::string("fan-backwall")) {
          auto fan = atof(output.second.c_str()) * 255.0f;
          out_fan_backwall.set(fan);
        }
      }
    });

    Wire.begin(PIN_SDA, PIN_SCL);

    sntp_setoperatingmode(SNTP_OPMODE_POLL);
    sntp_setservername(0, "pool.ntp.org");
    sntp_init();

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

    Wire1.begin(PIN_SENSOR_I2CSDA, PIN_SENSOR_I2CSCL, SENSOR_I2C_FRQ);

    if (sht21.init(Wire1)) {
      Serial.print("init(): success\n");
    } else {
      if (sht21.init(Wire)) {
        Serial.print("LEGACY INIT\n");
      } else {
        Serial.print("init(): failed\n");
      }
    }
    sht21.setAccuracy(SHTSensor::SHT_ACCURACY_MEDIUM); // only supported by SHT3x

  }

  void DryerController::fastloop() {
    if(heater_turn_off < xTaskGetTickCount()) {
      out_heater.set(0);
    }
  }

  void DryerController::loop() {
    checkDayCycle();
    updateSensors();

    if(settings.mqttcontrol) {
      Serial.println("Direct control mode active");;
      if(heater_temp < HEATER_MAX_TEMPERATURE) {
        heater_turn_off = (float)xTaskGetTickCount() + (float)configTICK_RATE_HZ * testmode_heater_power;
        out_heater.set(1);
      }
      else {
        out_heater.set(0);
        Serial.println("!!!!!!!!   HEATER THROTTLING !!!!!!!!!!");
      }

      if(directmode_timer < xTaskGetTickCount()) {
        Serial.println("DIRECTMODE TIMEOUT! REVERTING!");
        auto saved_settings = fg::settings().getStr("config");
        loadSettings(saved_settings.c_str());
      }
      heater_avg.push(heater_temp);
      auto fanramp = (heater_avg.avg() - HEATER_FANRAMP_START_TEMP) / (HEATER_FANRAMP_END_TEMP - HEATER_FANRAMP_START_TEMP);
      fanramp = fanramp < 0 ? 0 : fanramp > 1.0 ? 1.0 : fanramp;
      unsigned fanspeed = directmode_fan_internal + fanramp * (255 - directmode_fan_internal);
      Serial.printf("HEATER FANSPEED: %u\n\r", fanspeed);
      out_fan_internal.set(fanspeed);
    }
    else if(sensors_valid == false) {
      Serial.println("SENSOR ERROR!!! FAILSAVE MODE!!!");

      out_heater.set(0);
      state.out_heater = 0;
      out_dehumidifier.set(0);
      state.out_dehumidifier = 0;
    }
    else {
      if(settings.workmode == DryerControllerSettings::MODE_DRY) {
        Serial.println("MODE DRY");
        controlDehumidifier();
        controlHeater();
        out_fan_external.set(settings.fans.external * 2.55);
      }
      else {
        Serial.println("MODE OFF");
        out_heater.set(0);
        state.out_heater = 0;
        out_dehumidifier.set(0);
        state.out_dehumidifier = 0;

        out_fan_internal.set(0);
        out_fan_external.set(0);
        out_fan_backwall.set(0);
      }
    }



    Serial.printf("T:%.2f°C H:%.0f%% H:%.2f D:%.0f\n\r",
      state.temperature, state.humidity, state.out_heater, state.out_dehumidifier);

    DynamicJsonDocument status(1024);

    status["sensors"]["temperature"] = state.temperature;
    status["sensors"]["humidity"] = state.humidity;

    status["outputs"]["dehumidifier"] = state.out_dehumidifier;
    status["outputs"]["heater"] = state.out_heater;

    if(cloud.directMode()) {
      status["outputs"]["fan-internal"] = out_fan_internal.get() / 255.0f;
      status["outputs"]["fan-external"] = out_fan_external.get() / 255.0f;
      status["outputs"]["fan-backwall"] = out_fan_backwall.get() / 255.0f;
    }

    cloud.updateStatus(status);

    if (sntp_get_sync_status()) {
      printf("got time from sntp server\n");
      time_t now;
      struct tm timeinfo;
      time(&now);
      MCP7940.adjust(now);
    }
  }

  std::array<const char*, 6> modes = {
    DryerControllerSettings::MODE_OFF,
    DryerControllerSettings::MODE_DRY,
  };

  void DryerController::initSettingsMenu(UserInterface* ui) {


    auto menu = ui->push<SelectMenu>();

    menu->addOption("Dashboard", ICON_DASHBOARD, [ui, this](){ ui->pop(); });

    menu->addOption("Preset", ICON_SETTINGS, [ui, this](){

      ui->push<SelectInput>("Preset", 0, std::vector<std::string>{"Slow", "Medium", "Fast"}, [ui, this](uint32_t mode) {
        switch(mode) {
          case 0:
            settings.temperature = 15;
            settings.humidity = 60;
            break;
          case 1:
            settings.temperature = 20;
            settings.humidity = 55;
            break;
          case 2:
            settings.temperature = 25;
            settings.humidity = 50;
            break;
        }

        ui->pop();
        ui->pop();
        saveAndUploadSettings();
      });
    });

    menu->addOption("Control Mode", ICON_SETTINGS, [ui, this](){
      int mode = 0;
      for(int i = 0; i < modes.size(); i++) {
        if(settings.workmode == modes[i]) {
          mode = i;
          break;
        }
      }

      ui->push<SelectInput>("Control Mode", mode, std::vector<std::string>{"OFF", "Drying"}, [ui, this](uint32_t mode) {

        settings.workmode = modes[mode];
        Serial.print("MODE:");
        Serial.println(settings.workmode);
        ui->pop();
        ui->pop();
        initSettingsMenu(ui);
        saveAndUploadSettings();
      });
    });


    menu->addOption("Temperature", ICON_TEMPERATURE, [ui, this](){
      ui->push<FloatInput>("Temperature", settings.temperature, "C", 0, 40, 1, 0, [ui, this](float value) {
        settings.temperature = value;
        saveAndUploadSettings();
        ui->pop();
      });
    });

    menu->addOption("Humidity", ICON_HUMIDITY, [ui, this](){
      ui->push<FloatInput>("Humidity", settings.humidity, "%", 0, 100, 1, 0, [ui, this](float value) {
        settings.humidity = value;
        saveAndUploadSettings();
        ui->pop();
      });
    });


    menu->addOption("WiFi Connection", ICON_WIFI_FULL, [ui, this](){
      showWifiUi(ui, &cloud);
    });
  }

  void DryerController::initStatusMenu(UserInterface* ui) {
    ui->push<Dashboard>(&state.temperature, &state.humidity, &state.out_heater, &state.out_dehumidifier)
    ->onEnter([ui, this](){
      initSettingsMenu(ui);
    });
  }

}
