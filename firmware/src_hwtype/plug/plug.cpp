#include "plug.h"
#include "dashboard.h"
#include "wifi.h"
#include <MCP7940.h>
#include <sstream>

#include "time.h"
#include "esp_sntp.h"

#define SCD4X_I2C_ADDRESS 0x62

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
    return std::unique_ptr<AutomationController>(new PlugController(cloud));
  }


  void PlugController::updateSensors() {

    float temperature, humidity;
    uint16_t co2 = 0;
    char errorString[200];
    uint8_t error;

    static unsigned sensor_fails = 0;
    static TickType_t last_co2_sample;

    Wire.end();
    Wire.begin(PIN_SENSOR_I2CSDA, PIN_SENSOR_I2CSCL, SENSOR_I2C_FRQ);

    if(state.sensor_type == SENSOR_TYPE_SLAVE) {
      Serial.println("SENSOR IS SLAVE");
      if(daisyslave.read()) {
        state.co2 = daisyslave.getCo2();
        state.temperature = daisyslave.getTemperature();
        state.humidity = daisyslave.getHumidity();
        Serial.printf("TEMP: %f, HUM: %f, CO2: %f\n", daisyslave.getTemperature(), daisyslave.getHumidity(), daisyslave.getCo2());
        sensor_fails = 0;
      }
      else {
        sensor_fails++;
      }
    }
    else if(state.sensor_type == SENSOR_TYPE_SHT) {
      Serial.println("SENSOR IS SHT");
      uint8_t tries = 0;
      for(; tries < 2; tries++) {
        if (sht21.readSample()) {
          temperature = sht21.getTemperature();
          humidity = sht21.getHumidity();
          break;
        }
      }
      if(tries >= 2) {
        Serial.println("failed to read from temperature/humidity sensor!!!");
        sensor_fails++;
      }
      else {
        state.temperature = temperature;
        state.humidity = humidity;
        sensor_fails = 0;
      }
      state.co2 = 0;
    }
    else if(state.sensor_type == SENSOR_TYPE_SCD) {
      Serial.println("SENSOR IS SCD");

      for(uint8_t tries = 0; tries < 2; tries++) {
        uint16_t isDataReady = 0;
        error = scd4x.getDataReadyStatus(isDataReady);
        if (error) {
            Serial.println("Error trying to execute getDataReadyFlag(): ");
            sensor_fails++;
            continue;
        }
        if(isDataReady == 32774) {
          float temperature, humidity;
          uint16_t co2 = 0;
          error = scd4x.readMeasurement(co2, temperature, humidity);
          if (error) {
              Serial.println("Error trying to execute readMeasurement(): ");
              sensor_fails++;
              continue;
          } else if (co2 == 0) {
              Serial.println("Invalid sample detected, skipping.");
              sensor_fails++;
              continue;
          } else {
              state.co2 = co2;
              state.temperature = temperature;
              state.humidity = humidity;
              sensor_fails = 0;
            break;
          }
        }
      }
    }
    else {
      Serial.println("NO SENSOR!");
      Wire.end();
      if(initSensor()) {
        sensor_fails = 0;
      }
    }

    Wire.end();
    Wire.begin(PIN_SDA, PIN_SCL);

    if(sensor_fails < 10) {
      sensors_valid = true;
    }
    else {
      sensors_valid = false;
      state.sensor_type = SENSOR_TYPE_NONE;
    }
  }

  void PlugController::checkDayCycle() {
    time_t now;
    struct tm * ptm;
    struct tm timeinfo;

    time(&now);
    ptm = gmtime ( &now );

    Serial.printf("[%02d:%02d:%02d] ", ptm->tm_hour, ptm->tm_min, ptm->tm_sec);

    state.timeofday = ptm->tm_sec + 60 * ptm->tm_min + 60 * 60 * ptm->tm_hour;

    if(settings.daynight.day > settings.daynight.night) {
      state.is_day = state.timeofday > settings.daynight.day || state.timeofday < settings.daynight.night;
    }
    else if(settings.daynight.day < settings.daynight.night) {
      state.is_day = state.timeofday > settings.daynight.day && state.timeofday < settings.daynight.night;
    }
    else {
      state.is_day = false;
    }
  }


  void PlugController::controlDehumidifier() {
    static uint8_t output = 0;
    if(settings.usedaynight && !state.is_day) {
      if(state.humidity > settings.dehumidify.night.on) {
        output = 1;
      }
      else if(state.humidity < settings.dehumidify.night.off) {
        output = 0;
      }
    }
    else {
      if(state.humidity > settings.dehumidify.day.on) {
        output = 1;
      }
      else if(state.humidity < settings.dehumidify.day.off) {
        output = 0;
      }
    }

    Serial.println(output);

    out_relais.set(output);
  }

  void PlugController::controlHumidifier() {
    static uint8_t output = 0;
    if(settings.usedaynight && !state.is_day) {
      if(state.humidity < settings.humidify.night.on) {
        output = 1;
      }
      else if(state.humidity > settings.humidify.night.off) {
        output = 0;
      }
    }
    else {
      if(state.humidity < settings.humidify.day.on) {
        output = 1;
      }
      else if(state.humidity > settings.humidify.day.off) {
        output = 0;
      }
    }

    Serial.println(output);

    out_relais.set(output);
  }


  void PlugController::controlCooler() {
    static uint8_t cooling = 0;
    if(settings.usedaynight && !state.is_day) {
      if(state.temperature > settings.cooler.night.on) {
        cooling = 1;
      }
      else if(state.temperature < settings.cooler.night.off) {
        cooling = 9;
      }
    }
    else {
      if(state.temperature > settings.cooler.day.on) {
        cooling = 1;
      }
      else if(state.temperature < settings.cooler.day.off) {
        cooling = 0;
      }
    }

    out_relais.set(cooling);
  }

  void PlugController::controlHeater() {
    static uint8_t heating = 0;
    if(settings.usedaynight && !state.is_day) {
      if(state.temperature < settings.heater.night.on) {
        heating = 1;
      }
      else if(state.temperature > settings.heater.night.off) {
        heating = 0;
      }
    }
    else {
      if(state.temperature < settings.heater.day.on) {
        heating = 1;
      }
      else if(state.temperature > settings.heater.day.off) {
        heating = 0;
      }
    }

    Serial.println(heating);

    out_relais.set(heating);
  }

  void PlugController::controlCo2() {
    Serial.print("TIME:");
    Serial.println(state.timeofday % (settings.co2.period * 60));
    static uint8_t co2 = 0;
    if(state.co2 > 0) {
      if(!settings.usedaynight || state.is_day) {
        if(state.timeofday % (settings.co2.period * 60) < settings.co2.duration * 60 || settings.co2.mode == PlugControllerSettings::CO2MODE_CONST) {
          if(state.co2 < settings.co2.on) {
            co2 = 1;
          }
          if(state.co2 > settings.co2.off) {
            co2 = 0;
          }
        }
        else {
          co2 = 0;
        }
      }
      else {
        co2 = 0;
      }
      out_relais.set(co2);
    }
    else {
      out_relais.set(0);
    }

  }

  void PlugController::controlTimer() {
    bool inside_timer = false;
    for(auto timeframe : settings.timer.timeframes) {
      Serial.printf("ON: %d DUR: %d TIME: %d\n\r", timeframe.ontime, timeframe.duration * 60, state.timeofday);
      Serial.printf("ON: %d DUR: %d TIME: %d\n\r", timeframe.ontime, timeframe.ontime + timeframe.duration * 60, state.timeofday);

      if(timeframe.ontime + timeframe.duration * 60 > 24 * 3600) {
        if(state.timeofday < timeframe.ontime + timeframe.duration * 60 - 24 * 3600) {
          inside_timer = true;
        }
      }
      else {
        if(state.timeofday > timeframe.ontime && state.timeofday < timeframe.ontime + timeframe.duration * 60) {
          inside_timer = true;
        }
      }
    }
    Serial.printf("TIMER: %s\n\r", inside_timer ? "ON" : "OFF");
    out_relais.set(inside_timer);
  }

  void PlugController::checkLimits(uint8_t output) {
    static bool overtemperature_limited = false;
    if(settings.limits.overtemperature.enabled) {
      if(state.temperature > settings.limits.overtemperature.limit) {
        overtemperature_limited = true;
      }
      else if(state.temperature < settings.limits.overtemperature.limit - settings.limits.overtemperature.hysteresis) {
        overtemperature_limited = false;
      }
    }
    else {
      overtemperature_limited = false;
    }

    static bool undertemperature_limited = false;
    if(settings.limits.undertemperature.enabled) {
      if(state.temperature < settings.limits.undertemperature.limit) {
        undertemperature_limited = true;
      }
      else if(state.temperature > settings.limits.undertemperature.limit + settings.limits.undertemperature.hysteresis) {
        undertemperature_limited = false;
      }
    }
    else {
      undertemperature_limited = false;
    }

    if(!overtemperature_limited && !undertemperature_limited) {
      static uint8_t last_output_state = 0;
      static TickType_t last_turn_on = 0;
      static TickType_t last_turn_off = 0;

      if(settings.limits.time.enabled) {
        if(output != last_output_state) {
          if(output != 0 && xTaskGetTickCount() - last_turn_off > settings.limits.time.min_off) {
            last_turn_on = xTaskGetTickCount();
            out_relais.set(output);
            last_output_state = output;
          }
          if(output == 0 && xTaskGetTickCount() - last_turn_on > settings.limits.time.min_on) {
            last_turn_off = xTaskGetTickCount();
            out_relais.set(output);
            last_output_state = output;
          }
        }
      }
      else {
        out_relais.set(output);
        last_output_state = output;
      }
    }
  }

  PlugController::PlugController(Fridgecloud& cloud) :
    cloud(cloud),
    out_relais(PIN_RELAIS),
    heater_day_pid(HEATER_PID_P, HEATER_PID_I, HEATER_PID_D),
    heater_night_pid(HEATER_PID_P, HEATER_PID_I, HEATER_PID_D),
    sht21(SHTSensor::SHTSensorType::SHT4X),
    daisymaster(state.temperature, state.humidity, state.co2, state.sensor_type)
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

  void PlugController::loadSettings(const String& settings_json) {
    PlugControllerSettings new_settings;
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
      loadIfAvaliable(new_settings.usedaynight, doc["usedaynight"]);
      loadIfAvaliable(new_settings.daynight.day, doc["daynight"]["day"]);
      loadIfAvaliable(new_settings.daynight.night, doc["daynight"]["night"]);

      for(auto timeframe : doc["timer"]["timeframes"].as<JsonArray>()) {
        new_settings.timer.timeframes.push_back({timeframe["ontime"], timeframe["duration"]});
      }

      loadIfAvaliable(new_settings.heater.day.on, doc["heater"]["day"]["on"]);
      loadIfAvaliable(new_settings.heater.day.off, doc["heater"]["day"]["off"]);
      loadIfAvaliable(new_settings.heater.night.on, doc["heater"]["night"]["on"]);
      loadIfAvaliable(new_settings.heater.night.off, doc["heater"]["night"]["off"]);

      loadIfAvaliable(new_settings.cooler.day.on, doc["cooler"]["day"]["on"]);
      loadIfAvaliable(new_settings.cooler.day.off, doc["cooler"]["day"]["off"]);
      loadIfAvaliable(new_settings.cooler.night.on, doc["cooler"]["night"]["on"]);
      loadIfAvaliable(new_settings.cooler.night.off, doc["cooler"]["night"]["off"]);

      loadIfAvaliable(new_settings.humidify.day.on, doc["humidify"]["day"]["on"]);
      loadIfAvaliable(new_settings.humidify.day.off, doc["humidify"]["day"]["off"]);
      loadIfAvaliable(new_settings.humidify.night.on, doc["humidify"]["night"]["on"]);
      loadIfAvaliable(new_settings.humidify.night.off, doc["humidify"]["night"]["off"]);

      loadIfAvaliable(new_settings.dehumidify.day.on, doc["dehumidify"]["day"]["on"]);
      loadIfAvaliable(new_settings.dehumidify.day.off, doc["dehumidify"]["day"]["off"]);
      loadIfAvaliable(new_settings.dehumidify.night.on, doc["dehumidify"]["night"]["on"]);
      loadIfAvaliable(new_settings.dehumidify.night.off, doc["dehumidify"]["night"]["off"]);

      loadIfAvaliable(new_settings.co2.mode, doc["co2"]["mode"]);
      loadIfAvaliable(new_settings.co2.period, doc["co2"]["period"]);
      loadIfAvaliable(new_settings.co2.duration, doc["co2"]["duration"]);
      loadIfAvaliable(new_settings.co2.on, doc["co2"]["on"]);
      loadIfAvaliable(new_settings.co2.off, doc["co2"]["off"]);

      loadIfAvaliable(new_settings.limits.overtemperature.enabled, doc["limits"]["overtemperature"]["enabled"]);
      loadIfAvaliable(new_settings.limits.overtemperature.limit, doc["limits"]["overtemperature"]["limit"]);
      loadIfAvaliable(new_settings.limits.overtemperature.hysteresis, doc["limits"]["overtemperature"]["hysteresis"]);
      loadIfAvaliable(new_settings.limits.undertemperature.enabled, doc["limits"]["undertemperature"]["enabled"]);
      loadIfAvaliable(new_settings.limits.undertemperature.limit, doc["limits"]["undertemperature"]["limit"]);
      loadIfAvaliable(new_settings.limits.undertemperature.hysteresis, doc["limits"]["undertemperature"]["hysteresis"]);
      loadIfAvaliable(new_settings.limits.time.enabled, doc["limits"]["time"]["enabled"]);
      loadIfAvaliable(new_settings.limits.time.min_off, doc["limits"]["time"]["min_off"]);
      loadIfAvaliable(new_settings.limits.time.min_on, doc["limits"]["time"]["min_on"]);

      loadIfAvaliable(new_settings.fan, doc["fan"]);
    }

    Serial.printf("#################################################\n\r");
    Serial.printf("new_settings.workmode: %s\n\r", new_settings.workmode);
    Serial.printf("new_settings.usedaynight: %s\n\r", new_settings.usedaynight ? "YES" : "NO");
    Serial.printf("new_settings.daynight.day: %lu\n\r", new_settings.daynight.day);
    Serial.printf("new_settings.daynight.night: %lu\n\r", new_settings.daynight.night);
    for(auto timeframe : new_settings.timer.timeframes) {
      Serial.printf("on-time: %lu\n\r", timeframe.ontime);
      Serial.printf("duration: %lu\n\r", timeframe.duration);
    }
    Serial.printf("new_settings.heater.day.on: %.0f\n\r", new_settings.heater.day.on);
    Serial.printf("new_settings.heater.day.off: %.0f\n\r", new_settings.heater.day.off);
    Serial.printf("new_settings.heater.night.on: %.0f\n\r", new_settings.heater.night.on);
    Serial.printf("new_settings.heater.night.off: %.0f\n\r", new_settings.heater.night.off);
    Serial.printf("new_settings.cooler.day.on: %.0f\n\r", new_settings.cooler.day.on);
    Serial.printf("new_settings.cooler.day.off: %.0f\n\r", new_settings.cooler.day.off);
    Serial.printf("new_settings.cooler.night.on: %.0f\n\r", new_settings.cooler.night.on);
    Serial.printf("new_settings.cooler.night.off: %.0f\n\r", new_settings.cooler.night.off);
    Serial.printf("new_settings.humidify.day.on: %.0f\n\r", new_settings.humidify.day.on);
    Serial.printf("new_settings.humidify.day.off: %.0f\n\r", new_settings.humidify.day.off);
    Serial.printf("new_settings.humidify.night.on: %.0f\n\r", new_settings.humidify.night.on);
    Serial.printf("new_settings.humidify.night.off: %.0f\n\r", new_settings.humidify.night.off);
    Serial.printf("new_settings.dehumidify.day.on: %.0f\n\r", new_settings.dehumidify.day.on);
    Serial.printf("new_settings.dehumidify.day.off: %.0f\n\r", new_settings.dehumidify.day.off);
    Serial.printf("new_settings.dehumidify.night.on: %.0f\n\r", new_settings.dehumidify.night.on);
    Serial.printf("new_settings.dehumidify.night.off: %.0f\n\r", new_settings.dehumidify.night.off);
    Serial.printf("new_settings.co2.mode:  %s\n\r", new_settings.co2.mode);
    Serial.printf("new_settings.co2.period: %lu\n\r", new_settings.co2.period);
    Serial.printf("new_settings.co2.duration: %lu\n\r", new_settings.co2.duration);
    Serial.printf("new_settings.co2.on: %.0f\n\r", new_settings.co2.on);
    Serial.printf("new_settings.co2.off: %.0f\n\r", new_settings.co2.off);
    Serial.printf("new_settings.limits.overtemperature.enabled: %s\n\r", new_settings.limits.overtemperature.enabled ? "YES" : "NO");
    Serial.printf("new_settings.limits.overtemperature.limit: %.0f\n\r", new_settings.limits.overtemperature.limit);
    Serial.printf("new_settings.limits.overtemperature.hysteresis: %.0f\n\r", new_settings.limits.overtemperature.hysteresis);
    Serial.printf("new_settings.limits.undertemperature.enabled: %s\n\r", new_settings.limits.undertemperature.enabled ? "YES" : "NO");
    Serial.printf("new_settings.limits.undertemperature.limit: %.0f\n\r", new_settings.limits.undertemperature.limit);
    Serial.printf("new_settings.limits.undertemperature.hysteresis: %.0f\n\r", new_settings.limits.undertemperature.hysteresis);
    Serial.printf("new_settings.limits.time.enabled: %s\n\r", new_settings.limits.time.enabled ? "YES" : "NO");
    Serial.printf("new_settings.limits.time.min_off: %.0f\n\r", new_settings.limits.time.min_off);
    Serial.printf("new_settings.limits.time.min_on: %.0f\n\r", new_settings.limits.time.min_on);
    Serial.printf("#################################################\n\r");

    settings = new_settings;
  }

  void PlugController::saveAndUploadSettings() {
    DynamicJsonDocument doc(2048);

    DynamicJsonDocument array_doc(1024);
    doc["timer"]["timeframes"] = array_doc.to<JsonArray>();
    for(auto timeframe : settings.timer.timeframes) {
      DynamicJsonDocument timeframe_doc(256);
      timeframe_doc["ontime"] = timeframe.ontime;
      timeframe_doc["duration"] = timeframe.duration;
      doc["timer"]["timeframes"].add(timeframe_doc);
    }

    doc["workmode"] = settings.workmode;
    doc["usedaynight"] = settings.usedaynight;
    doc["daynight"]["day"] = settings.daynight.day;
    doc["daynight"]["night"] = settings.daynight.night;
    doc["heater"]["day"]["on"] = settings.heater.day.on;
    doc["heater"]["day"]["off"] = settings.heater.day.off;
    doc["heater"]["night"]["on"] = settings.heater.night.on;
    doc["heater"]["night"]["off"] = settings.heater.night.off;
    doc["cooler"]["day"]["on"] = settings.cooler.day.on;
    doc["cooler"]["day"]["off"] = settings.cooler.day.off;
    doc["cooler"]["night"]["on"] = settings.cooler.night.on;
    doc["cooler"]["night"]["off"] = settings.cooler.night.off;
    doc["humidify"]["day"]["on"] = settings.humidify.day.on;
    doc["humidify"]["day"]["off"] = settings.humidify.day.off;
    doc["humidify"]["night"]["on"] = settings.humidify.night.on;
    doc["humidify"]["night"]["off"] = settings.humidify.night.off;
    doc["dehumidify"]["day"]["on"] = settings.dehumidify.day.on;
    doc["dehumidify"]["day"]["off"] = settings.dehumidify.day.off;
    doc["dehumidify"]["night"]["on"] = settings.dehumidify.night.on;
    doc["dehumidify"]["night"]["off"] = settings.dehumidify.night.off;
    doc["co2"]["mode"] = settings.co2.mode;
    doc["co2"]["period"] = settings.co2.period;
    doc["co2"]["duration"] = settings.co2.duration;
    doc["co2"]["on"] = settings.co2.on;
    doc["co2"]["off"] = settings.co2.off;

    doc["limits"]["overtemperature"]["enabled"] = settings.limits.overtemperature.enabled;
    doc["limits"]["overtemperature"]["limit"] = settings.limits.overtemperature.limit;
    doc["limits"]["overtemperature"]["hysteresis"] = settings.limits.overtemperature.hysteresis;
    doc["limits"]["undertemperature"]["enabled"] = settings.limits.undertemperature.enabled;
    doc["limits"]["undertemperature"]["limit"] = settings.limits.undertemperature.limit;
    doc["limits"]["undertemperature"]["hysteresis"] = settings.limits.undertemperature.hysteresis;
    doc["limits"]["time"]["enabled"] = settings.limits.time.enabled;
    doc["limits"]["time"]["min_off"] = settings.limits.time.min_off;
    doc["limits"]["time"]["min_on"] = settings.limits.time.min_on;

    if(settings.workmode == PlugControllerSettings::MODE_CO2) {
      doc["fan"] = settings.fan;
    }
    else {
      doc["fan"] = "";
    }

    std::stringstream stream;
    serializeJson(doc, stream);

    Serial.println(stream.str().c_str());
    fg::settings().setStr("config", stream.str().c_str());
    fg::settings().commit();
    cloud.updateConfig(stream.str().c_str());
  }

  void PlugController::init() {
    char errorString[200];
    uint8_t errorcode;

    out_relais.set(0);

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

    cloud.onControl([&](std::pair<std::string, std::string> output) {
      if(settings.mqttcontrol) {
        if(output.first == std::string("relais")) {
          state.out = atof(output.second.c_str());
          out_relais.set(state.out > 0.5 ? 1 : 0);
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

    Wire.end();
    initSensor();
    Wire.begin(PIN_SDA, PIN_SCL);

    Serial.println("Waiting for first measurement... (5 sec)");

    co2_inject_start = xTaskGetTickCount() + CO2_INJECT_DELAY;

    daisymaster.init(PIN_SLAVE_I2CSDA, PIN_SLAVE_I2CSCL, SLAVE_I2C_FRQ);
  }

  bool PlugController::initSensor() {
    Wire.begin(PIN_SENSOR_I2CSDA, PIN_SENSOR_I2CSCL, SENSOR_I2C_FRQ);
    bool found_sensor = false;

    auto time = xTaskGetTickCount();

    if (sht21.init(Wire)) {
      Serial.print("init(): success\n");
      state.sensor_type = SENSOR_TYPE_SHT;
      sht21.setAccuracy(SHTSensor::SHT_ACCURACY_MEDIUM); // only supported by SHT3x
      Serial.println("FOUND SHT SENSOR");
      found_sensor = true;
    }

    Serial.print("SHT DELAY: ");
    Serial.println(xTaskGetTickCount() - time);
    time = xTaskGetTickCount();

    if(!found_sensor) {
      Wire.flush();
      scd4x.begin(Wire);
      Wire.beginTransmission(SCD4X_I2C_ADDRESS);
      if (Wire.endTransmission() == 0) {
        unsigned  error = scd4x.stopPeriodicMeasurement();
        found_sensor = true;

        if (error) {
          Serial.println("Error trying to execute stopPeriodicMeasurement(): ");
          found_sensor = false;
        }
        else {
          error = scd4x.setAutomaticSelfCalibration(0);
          if (error) {
            Serial.println("Error trying to execute setAutomaticSelfCalibration(): ");
            found_sensor = false;
          }
          else {
            error = scd4x.startPeriodicMeasurement();
            if (error) {
              Serial.println("Error trying to execute startPeriodicMeasurement(): ");
              found_sensor = false;
            }
          }
        }
      }

      if(found_sensor) {
        state.sensor_type = SENSOR_TYPE_SCD;
      }
    }

    Serial.printf("SCD DELAY: ");
    Serial.println(xTaskGetTickCount() - time);
    time = xTaskGetTickCount();

    if(!found_sensor) {
      daisyslave.init(Wire);
      if(daisyslave.read()) {
        state.sensor_type = SENSOR_TYPE_SLAVE;
        found_sensor = true;
        Serial.println("FOUND I2C MASTER SENSOR");
      }
    }

    Serial.printf("SLAVE DELAY: ");
    Serial.println(xTaskGetTickCount() - time);
    time = xTaskGetTickCount();

    Wire.end();
    return found_sensor;
  }

  void PlugController::fastloop() {
    if(heater_turn_off < xTaskGetTickCount()) {
      // out_heater.set(0);
    }
    if(testmode_duration == 0) {
      if(co2_inject_start + CO2_INJECT_DURATION < xTaskGetTickCount()) {
        // out_co2.set(0);
      }
    }
  }

  void PlugController::loop() {
    updateSensors();
    checkDayCycle();

    if(testmode_duration > 0) {
      testmode_duration--;
      Serial.println("TESTMODE ACTIVE!");
    }
    else if(settings.mqttcontrol) {
      Serial.println("Direct control mode active");;

      if(directmode_timer < xTaskGetTickCount()) {
        Serial.println("DIRECTMODE TIMEOUT! REVERTING!");
        auto saved_settings = fg::settings().getStr("config");
        loadSettings(saved_settings.c_str());
      }
    }
    else if(sensors_valid == false) {
      if(settings.workmode == PlugControllerSettings::MODE_TIMER) {
        Serial.println("MODE TIMER");
        controlTimer();
      }
      else {
        Serial.println("MODE OFF");
        out_relais.set(0);
      }
    }
    else {
      if(settings.workmode == PlugControllerSettings::MODE_CO2) {
        Serial.println("MODE CO2");
        controlCo2();
      }
      else if(settings.workmode == PlugControllerSettings::MODE_COOL) {
        Serial.println("MODE COOL");
        controlCooler();
      }
      else if(settings.workmode == PlugControllerSettings::MODE_DEHUMIDIFY) {
        Serial.println("MODE DEHUMIDIFY");
        controlDehumidifier();
      }
      else if(settings.workmode == PlugControllerSettings::MODE_HEAT) {
        Serial.println("MODE HEAT");
        controlHeater();
      }
      else if(settings.workmode == PlugControllerSettings::MODE_HUMIDIFY) {
        Serial.println("MODE HUMIDIFY");
        controlHumidifier();
      }
      else if(settings.workmode == PlugControllerSettings::MODE_TIMER) {
        Serial.println("MODE TIMER");
        controlTimer();
      }
      else if(settings.workmode == PlugControllerSettings::MODE_WATERING) {
        Serial.println("MODE WATERING");
      }
      else {
        Serial.println("MODE OFF");
        out_relais.set(0);
      }
    }



    Serial.printf("%s T:%.2f°C H:%.0f%% CO2:%.0fppm OUT:%s\n\r",
      state.is_day ? "DAY" : "NIGHT", state.temperature, state.humidity, state.co2, out_relais.get() ? "ON" : "OFF");

    DynamicJsonDocument status(1024);

    state.out = out_relais.get();

    status["sensors"]["temperature"] = state.temperature;
    status["sensors"]["humidity"] = state.humidity;
    status["sensors"]["co2"] = state.co2;
    status["sensors"]["sensor_type"] = state.sensor_type;

    status["outputs"]["relais"] = state.out;

    cloud.updateStatus(status);


    if (sntp_get_sync_status()) {
      printf("got time from sntp server\n");
      time_t now;
      struct tm timeinfo;
      time(&now);
      MCP7940.adjust(now);
    }
  }

  std::array<const char*, 8> modes = {
    PlugControllerSettings::MODE_OFF,
    PlugControllerSettings::MODE_HEAT,
    PlugControllerSettings::MODE_COOL,
    PlugControllerSettings::MODE_HUMIDIFY,
    PlugControllerSettings::MODE_DEHUMIDIFY,
    PlugControllerSettings::MODE_CO2,
    PlugControllerSettings::MODE_TIMER,
    PlugControllerSettings::MODE_WATERING
  };

  std::array<const char*, 8> co2modes = {
    PlugControllerSettings::CO2MODE_CONST,
    PlugControllerSettings::CO2MODE_PERIODIC,
  };

  void PlugController::initSettingsMenu(UserInterface* ui) {


    auto menu = ui->push<SelectMenu>();

    menu->addOption("Dashboard", ICON_DASHBOARD, [ui, this](){ ui->pop(); });

    menu->addOption("Control Mode", ICON_SETTINGS, [ui, this](){
      int mode = 0;
      for(int i = 0; i < modes.size(); i++) {
        if(settings.workmode == modes[i]) {
          mode = i;
          break;
        }
      }

      ui->push<SelectInput>("Control Mode", mode, std::vector<std::string>{"Off", "Heater", "Cooler", "Humidifier", "Dehumidifier", "Co2", "Timer"}, [ui, this](uint32_t mode) {

        settings.workmode = modes[mode];
        Serial.print("MODE:");
        Serial.println(settings.workmode);
        ui->pop();
        ui->pop();
        initSettingsMenu(ui);
        saveAndUploadSettings();
      });
    });

    if(settings.workmode != PlugControllerSettings::MODE_OFF && settings.workmode != PlugControllerSettings::MODE_TIMER) {
      menu->addOption("Use Day/Night", ICON_SETTINGS, [ui, this](){
        ui->push<SelectInput>("Use Day/Night", settings.usedaynight ? 0 : 1, std::vector<std::string>{"Yes", "No"}, [ui, this](uint32_t daynight) {

          settings.usedaynight = daynight == 0;
          ui->pop();
          ui->pop();
          initSettingsMenu(ui);
          saveAndUploadSettings();
        });
      });

      if(settings.usedaynight) {
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

        menu->addOption("Dayrise (UTC)", ICON_DAY, [ui, this](){
          ui->push<TimeEntry>("Dayrise (UTC)", settings.daynight.day, [ui, this](uint32_t value) {
            settings.daynight.day = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("Nightfall (UTC)", ICON_NIGHT, [ui, this](){
          ui->push<TimeEntry>("Nightfall (UTC)", settings.daynight.night, [ui, this](uint32_t value) {
            settings.daynight.night = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }
    }

    if(settings.workmode == PlugControllerSettings::MODE_HEAT) {

      if(settings.usedaynight) {
        menu->addOption("ON Day", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("ON Day", settings.heater.day.on, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.heater.day.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF Day", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("OFF Day", settings.heater.day.off, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.heater.day.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("ON Night", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("ON Night", settings.heater.night.on, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.heater.night.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF Night", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("OFF Night", settings.heater.night.off, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.heater.night.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }
      else {
        menu->addOption("ON", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("ON", settings.heater.night.on, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.heater.night.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("OFF", settings.heater.night.off, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.heater.night.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }

    }

    if(settings.workmode == PlugControllerSettings::MODE_COOL) {

      if(settings.usedaynight) {
        menu->addOption("ON Day", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("ON Day", settings.cooler.day.on, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.cooler.day.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF Day", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("OFF Day", settings.cooler.day.off, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.cooler.day.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("ON Night", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("ON Night", settings.cooler.night.on, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.cooler.night.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF Night", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("OFF Night", settings.cooler.night.off, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.cooler.night.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }
      else {
        menu->addOption("ON", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("ON", settings.cooler.night.on, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.cooler.night.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("OFF", settings.cooler.night.off, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.cooler.night.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }

    }

    if(settings.workmode == PlugControllerSettings::MODE_HUMIDIFY) {

      if(settings.usedaynight) {
        menu->addOption("ON Day", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("ON Day", settings.humidify.day.on, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.humidify.day.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF Day", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("OFF Day", settings.humidify.day.off, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.humidify.day.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("ON Night", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("ON Night", settings.humidify.night.on, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.humidify.night.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF Night", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("OFF Night", settings.humidify.night.off, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.humidify.night.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }
      else {
        menu->addOption("ON", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("ON", settings.humidify.night.on, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.humidify.night.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("OFF", settings.humidify.night.off, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.humidify.night.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }

    }

    if(settings.workmode == PlugControllerSettings::MODE_DEHUMIDIFY) {

      if(settings.usedaynight) {
        menu->addOption("ON Day", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("ON Day", settings.dehumidify.day.on, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.dehumidify.day.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF Day", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("OFF Day", settings.dehumidify.day.off, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.dehumidify.day.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("ON Night", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("ON Night", settings.dehumidify.night.on, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.dehumidify.night.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF Night", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("OFF Night", settings.dehumidify.night.off, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.dehumidify.night.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }
      else {
        menu->addOption("ON", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("ON", settings.dehumidify.night.on, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.dehumidify.night.on = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("OFF", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("OFF", settings.dehumidify.night.off, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.dehumidify.night.off = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }
    }

    if(settings.workmode == PlugControllerSettings::MODE_CO2) {

      menu->addOption("CO2 Mode", ICON_SETTINGS, [ui, this](){
        int co2mode = 0;
        for(int i = 0; i < co2modes.size(); i++) {
          if(settings.co2.mode == co2modes[i]) {
            co2mode = i;
            break;
          }
        }
        ui->push<SelectInput>("CO2 Mode", co2mode, std::vector<std::string>{"Constant", "Periodic"}, [ui, this](uint32_t mode) {
          settings.co2.mode = co2modes[mode];
          ui->pop();
          ui->pop();
          initSettingsMenu(ui);
          saveAndUploadSettings();
        });
      });

      if(settings.co2.mode == PlugControllerSettings::CO2MODE_PERIODIC) {
        menu->addOption("Period", ICON_SETTINGS, [ui, this](){
          ui->push<FloatInput>("Period", settings.co2.period, "min", 0, 120, 1, 0, [ui, this](float value) {
            settings.co2.period = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });

        menu->addOption("Duration", ICON_SETTINGS, [ui, this](){
          ui->push<FloatInput>("Duration", settings.co2.duration, "min", 0, 60, 1, 0, [ui, this](float value) {
            settings.co2.duration = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }

      menu->addOption("ON", ICON_SETTINGS, [ui, this](){
        ui->push<FloatInput>("ON", settings.co2.on, "", 0, 2000, 50, 0, [ui, this](float value) {
          settings.co2.on = value;
          saveAndUploadSettings();
          ui->pop();
        });
      });

      menu->addOption("OFF", ICON_SETTINGS, [ui, this](){
        ui->push<FloatInput>("OFF", settings.co2.off, "", 0, 2000, 50, 0, [ui, this](float value) {
          settings.co2.off = value;
          saveAndUploadSettings();
          ui->pop();
        });
      });
    }

    if(settings.workmode == PlugControllerSettings::MODE_TIMER) {
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

      menu->addOption("Timeslots", ICON_SETTINGS, [ui, this](){
        auto menu = ui->push<SelectMenu>();

        menu->addOption("back...", ICON_SETTINGS, [ui, this](){
          ui->pop();
          ui->pop();
        });

        unsigned id = 1;
        for(auto& timeframe : settings.timer.timeframes) {

          char time_name[128];
          char duration_name[128];
          sprintf(time_name, "On-Time %d", id);
          sprintf(duration_name, "Duration %d", id);

          menu->addOption(time_name, ICON_SETTINGS, [ui, this, time_name, &timeframe](){
            ui->push<TimeEntry>(time_name, timeframe.ontime, [ui, this, &timeframe](uint32_t value) {
              timeframe.ontime = value;
              saveAndUploadSettings();
              ui->pop();
            });
          });

          menu->addOption(duration_name, ICON_SETTINGS, [ui, this, duration_name, &timeframe](){
            ui->push<FloatInput>(duration_name, timeframe.duration, "min", 0, 720, 1, 0, [ui, this, &timeframe](float value) {
              timeframe.duration = value;
              saveAndUploadSettings();
              ui->pop();
            });
          });
          id++;
        }

        menu->addOption("add", ICON_SETTINGS, [ui, this](){
          settings.timer.timeframes.push_back({36000, 10});
          saveAndUploadSettings();
          ui->pop();
          ui->pop();
          initSettingsMenu(ui);
        });

        if(settings.timer.timeframes.size() > 0) {
          menu->addOption("remove", ICON_SETTINGS, [ui, this](){
            settings.timer.timeframes.pop_back();
            saveAndUploadSettings();
            ui->pop();
            ui->pop();
            initSettingsMenu(ui);
          });
        }
      });
    }

    menu->addOption("Projections", ICON_SETTINGS, [ui, this](){
      auto menu = ui->push<SelectMenu>();

      menu->addOption("back...", ICON_SETTINGS, [ui, this](){
        ui->pop();
      });

      menu->addOption("Overtemperature", ICON_SETTINGS, [ui, this](){
        auto menu = ui->push<SelectMenu>();

        menu->addOption("back...", ICON_SETTINGS, [ui, this](){
          ui->pop();
        });

        if(settings.limits.overtemperature.enabled) {
          menu->addOption("disable", ICON_SETTINGS, [ui, this](){
            settings.limits.overtemperature.enabled = false;
            saveAndUploadSettings();
            ui->pop();
            ui->pop();
            ui->pop();
            initSettingsMenu(ui);
          });

          menu->addOption("Limit", ICON_TEMPERATURE, [ui, this](){
            ui->push<FloatInput>("Limit", settings.limits.overtemperature.limit, "C", 0, 40, 1, 0, [ui, this](float value) {
              settings.limits.overtemperature.limit = value;
              saveAndUploadSettings();
              ui->pop();
            });
          });

          menu->addOption("Hysteresis", ICON_TEMPERATURE, [ui, this](){
            ui->push<FloatInput>("Hysteresis", settings.limits.overtemperature.hysteresis, "C", 0, 10, 1, 0, [ui, this](float value) {
              settings.limits.overtemperature.hysteresis = value;
              saveAndUploadSettings();
              ui->pop();
            });
          });
        }
        else {
          menu->addOption("enable", ICON_SETTINGS, [ui, this](){
            settings.limits.overtemperature.enabled = true;
            saveAndUploadSettings();
            ui->pop();
            ui->pop();
            ui->pop();
            initSettingsMenu(ui);
          });
        }
      });

      menu->addOption("Undertemperature", ICON_SETTINGS, [ui, this](){
        auto menu = ui->push<SelectMenu>();

        menu->addOption("back...", ICON_SETTINGS, [ui, this](){
          ui->pop();
        });

        if(settings.limits.undertemperature.enabled) {
          menu->addOption("disable", ICON_SETTINGS, [ui, this](){
            settings.limits.undertemperature.enabled = false;
            saveAndUploadSettings();
            ui->pop();
            ui->pop();
            ui->pop();
            initSettingsMenu(ui);
          });

          menu->addOption("Limit", ICON_TEMPERATURE, [ui, this](){
            ui->push<FloatInput>("Limit", settings.limits.undertemperature.limit, "C", 0, 40, 1, 0, [ui, this](float value) {
              settings.limits.undertemperature.limit = value;
              saveAndUploadSettings();
              ui->pop();
            });
          });

          menu->addOption("Hysteresis", ICON_TEMPERATURE, [ui, this](){
            ui->push<FloatInput>("Hysteresis", settings.limits.undertemperature.hysteresis, "C", 0, 10, 1, 0, [ui, this](float value) {
              settings.limits.undertemperature.hysteresis = value;
              saveAndUploadSettings();
              ui->pop();
            });
          });
        }
        else {
          menu->addOption("enable", ICON_SETTINGS, [ui, this](){
            settings.limits.undertemperature.enabled = true;
            saveAndUploadSettings();
            ui->pop();
            ui->pop();
            ui->pop();
            initSettingsMenu(ui);
          });
        }
      });

      menu->addOption("Timelimits", ICON_SETTINGS, [ui, this](){
        auto menu = ui->push<SelectMenu>();

        menu->addOption("back...", ICON_SETTINGS, [ui, this](){
          ui->pop();
        });

        if(settings.limits.time.enabled) {
          menu->addOption("disable", ICON_SETTINGS, [ui, this](){
            settings.limits.time.enabled = false;
            saveAndUploadSettings();
            ui->pop();
            ui->pop();
            ui->pop();
            initSettingsMenu(ui);
          });

          menu->addOption("Min ON Time", ICON_TEMPERATURE, [ui, this](){
            ui->push<FloatInput>("Min ON Time", settings.limits.time.min_on, "s", 0, 1800, 10, 0, [ui, this](float value) {
              settings.limits.time.min_on = value;
              saveAndUploadSettings();
              ui->pop();
            });
          });

          menu->addOption("Min OFF Time", ICON_TEMPERATURE, [ui, this](){
            ui->push<FloatInput>("Min OFF Time", settings.limits.time.min_off, "s", 0, 1800, 10, 0, [ui, this](float value) {
              settings.limits.time.min_off = value;
              saveAndUploadSettings();
              ui->pop();
            });
          });
        }
        else {
          menu->addOption("enable", ICON_SETTINGS, [ui, this](){
            settings.limits.time.enabled = true;
            saveAndUploadSettings();
            ui->pop();
            ui->pop();
            ui->pop();
            initSettingsMenu(ui);
          });
        }
      });

    });


    menu->addOption("WiFi Connection", ICON_WIFI_FULL, [ui, this](){
      showWifiUi(ui, &cloud);
    });
  }

  void PlugController::initStatusMenu(UserInterface* ui) {
    ui->push<Dashboard>(&state.temperature, &state.humidity, &state.co2, &state.out, &state.sensor_type, &state.is_day, &settings.usedaynight)
    ->onEnter([ui, this](){
      initSettingsMenu(ui);
    });
  }

}
