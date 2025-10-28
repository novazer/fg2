#include "fan.h"
#include "dashboard.h"
#include "wifi.h"
#include "time.h"
#include "esp_sntp.h"

#include <sstream>
namespace fg {


  template<class T> inline void loadIfAvaliable(T& val, DynamicJsonDocument doc) {
    if(!doc.isNull()) {
      val = doc.as<T>();
    }
    else {
      Serial.println("error loading settings field");
    }
  }

  static uint32_t rpm = 0;

  static void IRAM_ATTR rpm_counter() {
    rpm++;
  }

  std::unique_ptr<AutomationController> createController(Fridgecloud& cloud) {
    return std::unique_ptr<AutomationController>(new FanController(cloud));
  }

  FanController::FanController(Fridgecloud& cloud) :cloud(cloud), out_fan(PIN_FAN, 0) {}

  void FanController::updateSensors() {

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

  void FanController::checkDayCycle() {
    auto optical = analogRead(PIN_LIGHTSENSOR);
    state.is_day = optical > THRESHHOLD_DAYLIGHT;
    state.optical = optical;

    time_t now;
    struct tm * ptm;
    struct tm timeinfo;

    time(&now);
    ptm = gmtime ( &now );

    Serial.printf("[%02d:%02d:%02d] ", ptm->tm_hour, ptm->tm_min, ptm->tm_sec);

    state.timeofday = ptm->tm_sec + 60 * ptm->tm_min + 60 * 60 * ptm->tm_hour;
  }

  void FanController::controlFan() {
  float t_min, t_max, h_min, h_max, max;
  static float fan_current = 0.0f;

  if(settings.mode != FanControllerSettings::MODE_FIXED) {
    if(state.is_day) {
      t_min = settings.day.temperature - HALF_HYST_TEMPERATURE;
      t_max = settings.day.temperature + HALF_HYST_TEMPERATURE;
      h_min = settings.day.humidity - HALF_HYST_HUMIDITY;
      h_max = settings.day.humidity + HALF_HYST_HUMIDITY;
      max   = settings.day.max_speed;
    }
    else {
      t_min = settings.night.temperature - HALF_HYST_TEMPERATURE;
      t_max = settings.night.temperature + HALF_HYST_TEMPERATURE;
      h_min = settings.night.humidity - HALF_HYST_HUMIDITY;
      h_max = settings.night.humidity + HALF_HYST_HUMIDITY;
      max   = settings.night.max_speed;
    }

    float t_out = (state.temperature - t_min) / (t_max - t_min);
    float h_out = (state.humidity - h_min) / (h_max - h_min);

    float out = 0;

    if(settings.mode == FanControllerSettings::MODE_BOTH) {
      out = t_out > h_out ? t_out : h_out;
    }
    else if(settings.mode == FanControllerSettings::MODE_TEMPERATURE) {
      out = t_out;
    }
    else {
      out = h_out;
    }

    out = out > 1 ? 1 : out;
    out = out < 0 ? 0 : out;

    float fan_out = settings.min_speed + out * (max - settings.min_speed);

    fan_current = (1.0f - controlspeed) * fan_current + controlspeed * fan_out;

    if(fan_current < settings.min_speed) {
      fan_current = settings.min_speed;
    }
    if(fan_current > max) {
      fan_current = max;
    }
  }
  else {
    if(state.is_day) {
      fan_current = settings.day.fixed_speed;
    }
    else {
      fan_current = settings.night.fixed_speed;
    }
  }

  if(settings.co2inject.enabled) {
    bool co2inject_active = true;
    if(settings.co2inject.usedaynight) {
      if(settings.co2inject.day > settings.co2inject.night) {
        co2inject_active = state.timeofday > settings.co2inject.day || state.timeofday < settings.co2inject.night;
      }
      else if(settings.co2inject.day < settings.co2inject.night) {
        co2inject_active = state.timeofday > settings.co2inject.day && state.timeofday < settings.co2inject.night;
      }
      else {
        co2inject_active = false;
      }
    }
    if(co2inject_active) {
      if(state.timeofday % (settings.co2inject.period * 60) < settings.co2inject.duration * 60) {
        if(fan_current > settings.co2inject.speed) {
          fan_current = settings.co2inject.speed;
        }
      }
    }
  }

  uint8_t pid_send = 255 - (uint8_t)(255.0f * fan_current / 100.0f);
  state.fanspeed = fan_current;
  out_fan.set(pid_send);
}

void FanController::fastloop() {
}

void FanController::loop() {

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
      controlFan();
    }

    state.rpm = (float)rpm * 60.0f / 2.0f;
    rpm = 0;

    DynamicJsonDocument status(1024);
    status["sensors"]["temperature"] = state.temperature;
    status["sensors"]["humidity"] = state.humidity;
    status["sensors"]["rpm"] = state.rpm;
    status["sensors"]["day"] = state.is_day ? 1.0 : 0.0;
    status["outputs"]["fan"] = state.fanspeed;

    cloud.updateStatus(status);

    Serial.printf("%s T:%.2f°C H:%.0f%% F:%.0f\n\r",
      state.is_day ? "DAY" : "NIGHT", state.temperature, state.humidity, state.fanspeed);

    if (sntp_get_sync_status()) {
      printf("got time from sntp server\n");
      time_t now;
      struct tm timeinfo;
      time(&now);
    }
  }
  catch(...) {
    Serial.println("Exception in control function!");
  }
}

void FanController::saveAnduploadSettings() {
  Serial.print("this: ");
  Serial.println(reinterpret_cast<uint32_t>(this));
  try {
    fg::settings().setFloat("d_t", settings.day.temperature);
    fg::settings().setFloat("d_h", settings.day.humidity);
    fg::settings().setFloat("d_fs", settings.day.fixed_speed);
    fg::settings().setFloat("d_ms", settings.day.max_speed);
    fg::settings().setFloat("n_t", settings.night.temperature);
    fg::settings().setFloat("n_h", settings.night.humidity);
    fg::settings().setFloat("n_fs", settings.night.fixed_speed);
    fg::settings().setFloat("n_ms", settings.night.max_speed);
    fg::settings().setU8("m", settings.mode);
    fg::settings().setU8("ms", settings.min_speed);
    fg::settings().commit();

    StaticJsonDocument<512> config;
    config["day"]["temperature"] = settings.day.temperature;
    config["day"]["humidity"] = settings.day.humidity;

    config["day"]["fixed_speed"] = settings.day.fixed_speed;
    config["day"]["max_speed"] = settings.day.max_speed;
    config["night"]["temperature"] = settings.night.temperature;
    config["night"]["humidity"] = settings.night.humidity;
    config["night"]["fixed_speed"] = settings.night.fixed_speed;
    config["night"]["max_speed"] = settings.night.max_speed;
    config["mode"] = settings.mode;
    config["min_speed"] = settings.min_speed;

    std::stringstream stream;
    serializeJson(config, stream);

    Serial.println(stream.str().c_str());

    cloud.updateConfig(stream.str().c_str());
  }
  catch(...) {
    Serial.println("EXCEPTION saving settings!");
  }
}

  void FanController::initStatusMenu(UserInterface* ui) {
    ui->push<Dashboard>(&state.temperature, &state.humidity, &state.fanspeed, &state.rpm, &state.is_day)
    ->onEnter([ui, this](){
      initSettingsMenu(ui);
    });
  }

  void FanController::initSettingsMenu(UserInterface* ui) {
    auto menu = ui->push<SelectMenu>();

    menu->addOption("Dashboard", ICON_DASHBOARD, [ui, this](){ ui->pop(); });

    menu->addOption("Control Mode", ICON_SETTINGS, [ui, this](){
      ui->push<SelectInput>("Control Mode", settings.mode, std::vector<std::string>{"Fixed", "T", "RH", "T&RH"}, [ui, this](uint32_t mode) {
        settings.mode = mode;
        Serial.print("MODE:");
        Serial.println(mode);
        ui->pop();
        ui->pop();
        initSettingsMenu(ui);
        saveAnduploadSettings();
      });
    });

    if(settings.mode == 0) {
      menu->addOption("Day Speed", ICON_DAY, [ui, this](){
        ui->push<FloatInput>("Day Speed", settings.day.fixed_speed, "%", 0, 100, 1, 0, [ui, this](float value) {
          settings.day.fixed_speed = value;
          saveAnduploadSettings();
          ui->pop();
        });
      });
      menu->addOption("Night Speed", ICON_NIGHT, [ui, this](){
        ui->push<FloatInput>("Night Speed", settings.night.fixed_speed, "%", 0, 100, 1, 0, [ui, this](float value) {
          settings.night.fixed_speed = value;
          saveAnduploadSettings();
          ui->pop();
        });
      });
    }
    if(settings.mode == 1 || settings.mode == 3) {
      menu->addOption("Day Temperature", ICON_TEMPERATURE, [ui, this](){
        ui->push<FloatInput>("Day Temperature", settings.day.temperature, "C", 0, 50, 1, 0, [ui, this](float value) {
          settings.day.temperature = value;
          saveAnduploadSettings();
          ui->pop();
        });
      });
      menu->addOption("Night Temperature", ICON_TEMPERATURE, [ui, this](){
        ui->push<FloatInput>("Night Temperature", settings.night.temperature, "C", 0, 50, 1, 0, [ui, this](float value) {
          settings.night.temperature = value;
          saveAnduploadSettings();
          ui->pop();
        });
      });
    }
    if(settings.mode == 2 || settings.mode == 3) {
      menu->addOption("Day Humidity", ICON_HUMIDITY, [ui, this](){
        ui->push<FloatInput>("Day Humidity", settings.day.humidity, "%", 0, 100, 1, 0, [ui, this](float value) {
          settings.day.humidity = value;
          saveAnduploadSettings();
          ui->pop();
        });
      });
      menu->addOption("Night Humidity", ICON_HUMIDITY, [ui, this](){
        ui->push<FloatInput>("Night Humidity", settings.night.humidity, "%", 0, 100, 1, 0, [ui, this](float value) {
          settings.night.humidity = value;
          saveAnduploadSettings();
          ui->pop();
        });
      });
    }
    if(settings.mode != 0) {
      menu->addOption("Min. Speed", ICON_FAN, [ui, this](){
        ui->push<FloatInput>("Min. Speed", settings.min_speed, "%", 0, 100, 1, 0, [ui, this](float value) {
          settings.min_speed = value;
          saveAnduploadSettings();
          ui->pop();
        });
      });
      menu->addOption("Max. Speed Day", ICON_DAY, [ui, this](){
        ui->push<FloatInput>("Max. Speed Day", settings.day.max_speed, "%", 0, 100, 1, 0, [ui, this](float value) {
          settings.day.max_speed = value;
          saveAnduploadSettings();
          ui->pop();
        });
      });
      menu->addOption("Max. Speed Night", ICON_NIGHT, [ui, this](){
        ui->push<FloatInput>("Max. Speed Night", settings.night.max_speed, "%", 0, 100, 1, 0, [ui, this](float value) {
          settings.night.max_speed = value;
          saveAnduploadSettings();
          ui->pop();
        });
      });
    }
    menu->addOption("WiFi Connection", ICON_WIFI_FULL, [ui, this](){
      showWifiUi(ui, &cloud);
    });
  }

  void FanController::init() {
    Wire.begin(PIN_SDA, PIN_SCL);
    Wire1.begin(PIN_SENSOR_I2CSDA, PIN_SENSOR_I2CSCL, SENSOR_I2C_FRQ);
    delay(100);

    sntp_setoperatingmode(SNTP_OPMODE_POLL);
    sntp_setservername(0, "pool.ntp.org");
    sntp_init();

    if (sht.init(Wire1)) {
        Serial.print("init(): success\n");
    } else {
        Serial.print("init(): failed\n");
    }
    sht.setAccuracy(SHTSensor::SHT_ACCURACY_MEDIUM); // only supported by SHT3x

    pinMode(PIN_LIGHTSENSOR, INPUT_PULLUP);
    pinMode(PIN_RPM, INPUT_PULLUP);
    attachInterrupt(PIN_RPM, rpm_counter, FALLING);

    auto saved_settings = fg::settings().getStr("config");
    loadSettings(saved_settings.c_str());

    cloud.onConfig([&](const String& payload) {
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

    cloud.onCommand([&](const JsonDocument& command) {
      if(command["action"] && command["action"] == std::string("test")) {
        testmode_duration = TESTMODE_MAX_DURATION;
      }
      else if(command["action"] && command["action"] == std::string("stoptest")) {
        testmode_duration = 0;
      }
    });


    cloud.onControl([&](std::pair<std::string, std::string> output) {
      if(settings.mqttcontrol) {
        if(output.first == std::string("fan")) {
          state.fanspeed = atof(output.second.c_str());
          out_fan.set(255 - 2.55f * state.fanspeed);
        }
      }
    });
  }

  void FanController::loadSettings(const String& settings_json) {
    FanControllerSettings new_settings;
    DynamicJsonDocument doc(2048);
    DeserializationError error = deserializeJson(doc, settings_json);

    // Test if parsing succeeds.
    if (error) {
      Serial.println("error parsing settings json");
      settings = new_settings;
    }
    else {
      loadIfAvaliable(new_settings.mqttcontrol, doc["mqttcontrol"]);
      loadIfAvaliable(new_settings.mode, doc["mode"]);
      loadIfAvaliable(new_settings.min_speed, doc["min_speed"]);
      loadIfAvaliable(new_settings.day.temperature, doc["day"]["temperature"]);
      loadIfAvaliable(new_settings.day.humidity, doc["day"]["humidity"]);
      loadIfAvaliable(new_settings.day.fixed_speed, doc["day"]["fixed_speed"]);
      loadIfAvaliable(new_settings.day.max_speed, doc["day"]["max_speed"]);
      loadIfAvaliable(new_settings.night.temperature, doc["night"]["temperature"]);
      loadIfAvaliable(new_settings.night.humidity, doc["night"]["humidity"]);
      loadIfAvaliable(new_settings.night.fixed_speed, doc["night"]["fixed_speed"]);
      loadIfAvaliable(new_settings.night.max_speed, doc["night"]["max_speed"]);
      if(!doc["co2inject"]["device_id"].isNull()) {
        new_settings.co2inject.enabled = true;
        loadIfAvaliable(new_settings.co2inject.speed, doc["co2inject"]["speed"]);
        loadIfAvaliable(new_settings.co2inject.usedaynight, doc["co2inject"]["usedaynight"]);
        loadIfAvaliable(new_settings.co2inject.day, doc["co2inject"]["day"]);
        loadIfAvaliable(new_settings.co2inject.night, doc["co2inject"]["night"]);
        loadIfAvaliable(new_settings.co2inject.period, doc["co2inject"]["period"]);
        loadIfAvaliable(new_settings.co2inject.duration, doc["co2inject"]["duration"]);
      }
    }

    Serial.printf("#################################################\n\r");
    Serial.printf("new_settings.mode:                %d\n\r", new_settings.mode);
    Serial.printf("new_settings.min_speed:           %.0f\n\r", new_settings.min_speed);
    Serial.printf("new_settings.day.temperature:     %.2f\n\r", new_settings.day.temperature);
    Serial.printf("new_settings.day.humidity:        %.0f\n\r", new_settings.day.humidity);
    Serial.printf("new_settings.day.fixed_speed:     %.0f\n\r", new_settings.day.fixed_speed);
    Serial.printf("new_settings.day.max_speed:       %.0f\n\r", new_settings.day.max_speed);
    Serial.printf("new_settings.night.temperature:   %.2f\n\r", new_settings.night.temperature);
    Serial.printf("new_settings.night.humidity:      %.0f\n\r", new_settings.night.humidity);
    Serial.printf("new_settings.night.fixed_speed:   %.0f\n\r", new_settings.night.fixed_speed);
    Serial.printf("new_settings.night.max_speed:     %.0f\n\r", new_settings.night.max_speed);
    if(new_settings.co2inject.enabled) {
      Serial.printf("new_settings.co2inject.speed:     %.0f\n\r", new_settings.co2inject.speed);
      Serial.printf("new_settings.co2inject.usedaynight:     %u\n\r", new_settings.co2inject.usedaynight);
      Serial.printf("new_settings.co2inject.day:     %lu\n\r", new_settings.co2inject.day);
      Serial.printf("new_settings.co2inject.night:     %lu\n\r", new_settings.co2inject.night);
      Serial.printf("new_settings.co2inject.period:     %lu\n\r", new_settings.co2inject.period);
      Serial.printf("new_settings.co2inject.duration:     %lu\n\r", new_settings.co2inject.duration);
    }
    Serial.printf("#################################################\n\r");

    settings = new_settings;
  }

}