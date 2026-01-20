#include "fridge.h"
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
    return std::unique_ptr<AutomationController>(new FridgeController(cloud));
  }


  void FridgeController::updateSensors() {

    float temperature_sht, humidity_sht, temperature_scd, humidity_scd;
    uint16_t co2 = 0;
    char errorString[200];
    uint8_t error;

    bool sht_valid = false;
    bool scd_valid = false;
    static unsigned sht_fails = 0;
    static unsigned co2_fails = 0;
    static TickType_t last_co2_sample;

    Wire.flush();

    uint8_t tries = 0;
    for(; tries < 2; tries++) {
      if (sht21.readSample()) {
        temperature_sht = sht21.getTemperature();
        humidity_sht = sht21.getHumidity();
        humidity_sht = humidity_sht > 100.0 ? 100.0 : humidity_sht;
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

    for(uint8_t tries = 0; tries < 2; tries++) {

      uint16_t isDataReady = 0;
      error = scd4x.getDataReadyStatus(isDataReady);
      if (error) {
          Serial.println("Error trying to execute getDataReadyFlag(): ");
          continue;
      }
      if(isDataReady == 32774) {
        error = scd4x.readMeasurement(co2, temperature_scd, humidity_scd);
        if (error) {
            Serial.println("Error trying to execute readMeasurement(): ");
            co2_fails++;
            continue;
        } else if (co2 == 0) {
            Serial.println("Invalid sample detected, skipping.");
            co2_fails++;
            continue;
        } else {
            co2_avg.push(co2);
            state.co2 = co2_avg.avg();
            co2_fails = 0;
            last_co2_sample = xTaskGetTickCount();
            scd_valid = true;
          break;
        }
      }
    }

    if(xTaskGetTickCount() - last_co2_sample > 10000) {
      Serial.println("CO2 sensor timeout!");
      co2_fails++;
    }

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

    if(scd_valid) {
      if(temperature_scd > state.temperature + MAX_SENSOR_DEVIATION || temperature_scd < state.temperature - MAX_SENSOR_DEVIATION) {
        state.humidity = humidity_scd;
        state.temperature = temperature_scd;
        if(!sensor_deviation_logged) {
          cloud.log("message-ext-sensor-deviate");
          sensor_deviation_logged = true;
        }
      }
      else {
        sensor_deviation_logged = false;
      }
    }

    if(sht_fails >= 10 && !sensor_fail_logged) {
      cloud.log("message-ext-sensor-fail");
      sensor_fail_logged = true;
    }
    else {
      sensor_fail_logged = false;
    }

    if(co2_fails < 10) {
      sensors_valid = true;
    }
    else {
      sensors_valid = false;
    }
  }

  void FridgeController::checkDayCycle() {
    time_t now;
    struct tm * ptm;
    struct tm timeinfo;

    time(&now);
    ptm = gmtime ( &now );

    Serial.printf("[%02d:%02d:%02d] ", ptm->tm_hour, ptm->tm_min, ptm->tm_sec);

    state.timeofday = ptm->tm_sec + 60 * ptm->tm_min + 60 * 60 * ptm->tm_hour;

    if(settings.workmode == FridgeControllerSettings::MODE_FULL || settings.workmode == FridgeControllerSettings::MODE_EXP || settings.workmode == FridgeControllerSettings::MODE_SMALL || settings.workmode == FridgeControllerSettings::MODE_TEMP) {
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
    else {
      state.is_day = false;
    }
  }

  void FridgeController::controlCo2() {

    if(state.is_day) {
      if(co2_inject_end < xTaskGetTickCount()) {
        if((co2_avg.avg() < settings.co2.target && xTaskGetTickCount() > pause_until_tick)) {
          state.out_co2 = 1;
          out_co2.set(1);
          co2_valve_close = xTaskGetTickCount() + co2_inject_count * CO2_INJECT_DURATION;
          co2_inject_count = co2_inject_count < CO2_INJECT_MAX_COUNT ? co2_inject_count * 2 : co2_inject_count;
        }
        else {
          state.out_co2 = 0;
          co2_inject_count = co2_inject_count >= 2 ? co2_inject_count / 2 : 1;
        }
        co2_inject_end = xTaskGetTickCount() + CO2_INJECT_PERIOD;
      }
    }
    else {
      state.out_co2 = 0;
      co2_inject_end = xTaskGetTickCount();
      out_co2.set(0);
    }
    //state.out_co2 = co2_inject_count;
    if(co2_avg.avg() > settings.co2.target + CO2_OVERSWING_ABORT) {
      out_co2.set(0);
    }
  }

  void FridgeController::controlLight() {
    const int SECONDS_PER_DAY = 24 * 60 * 60;

    if (settings.lights.maintenanceOn > 0) {
        state.out_light = 15f;
        out_light.set(255.0f * (settings.lights.limit / 100.0f));
    } else if(state.is_day) {

      static float light_current = 0.0f;

      float t_min = settings.day.temperature + LIGHT_TEMP_HYST;
      float t_max = t_min + LIGHT_TEMP_HYST;

      float out = 1.0f - (state.temperature - t_min) / (t_max - t_min);

      float max_out = 1.0f;
      if (xTaskGetTickCount() <= pause_until_tick) {
          max_out = 0.15f;
      }
      else
      {
          if((state.timeofday + SECONDS_PER_DAY) < (settings.daynight.day + SECONDS_PER_DAY + settings.lights.sunrise * 60)) {
            //LOG("TON: %d\n", state.time - settings.daynight.day);
            max_out = static_cast<float>(state.timeofday - settings.daynight.day) / (settings.lights.sunrise * 60.0f);
          }
          if((state.timeofday + SECONDS_PER_DAY) > (settings.daynight.night + SECONDS_PER_DAY - settings.lights.sunset * 60)) {
            //LOG("TOFF: %d\n", state.time - settings.daynight.night);
            max_out = static_cast<float>(settings.daynight.night - state.timeofday) / (settings.lights.sunset * 60.0f);
          }
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

      light_current = light_current > (settings.lights.limit / 100.0f) ? (settings.lights.limit / 100.0f) : light_current;

      state.out_light = light_current * 100.0f;
      out_light.set(255.0f * light_current);
    }
    else {
      state.out_light = 0;
      out_light.set(state.out_light);
    }
  }

  void FridgeController::controlDehumidifier() {
    humidity_avg.push(state.humidity);

    float target_humidity = state.is_day ? settings.day.humidity : settings.night.humidity;
    float target_temperature = state.is_day ? settings.day.temperature : settings.night.temperature;
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

    if (xTaskGetTickCount() <= pause_until_tick) {
          state.out_dehumidifier = 0;
    }
    else if(dehumidify && temperature_override) {
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


  void FridgeController::controlCooling() {

    float target_temperature = state.is_day ? settings.day.temperature : settings.night.temperature;

    static uint8_t cool = 0;
    static uint32_t turn_off_time = 0;

    if(state.temperature > target_temperature + 0.8) {
      cool = 1;
    }
    if(state.temperature < target_temperature + 0.3) {
      cool = 0;
    }


    if (xTaskGetTickCount() <= pause_until_tick) {
      state.out_dehumidifier = 0;
    }
    else if(cool) {
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

    out_dehumidifier.set(state.out_dehumidifier);
    out_fan_backwall.set(255);
  }

  void FridgeController::controlHeater() {

    if (xTaskGetTickCount() <= pause_until_tick) {
      state.out_heater = 0;
    }
    else if(state.is_day) {
      state.out_heater = heater_day_pid.tick(state.temperature, settings.day.temperature);
    }
    else {
      state.out_heater = heater_night_pid.tick(state.temperature, settings.night.temperature);
    }

    heater_turn_off = (float)xTaskGetTickCount() + (float)configTICK_RATE_HZ * state.out_heater;

    if (xTaskGetTickCount() < pause_until_tick) {
      out_heater.set(0);
    }
    else if(heater_temp < HEATER_MAX_TEMPERATURE) {
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

  FridgeController::FridgeController(Fridgecloud& cloud) :
    cloud(cloud),
    out_heater(PIN_HEATER),
    out_dehumidifier(PIN_DEHUMIDIFIER),
    out_co2(PIN_CO2),
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

  void FridgeController::loadSettings(const String& settings_json) {
    FridgeControllerSettings new_settings;
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
      loadIfAvaliable(new_settings.daynight.day, doc["daynight"]["day"]);
      loadIfAvaliable(new_settings.daynight.night, doc["daynight"]["night"]);
      loadIfAvaliable(new_settings.co2.target, doc["co2"]["target"]);
      loadIfAvaliable(new_settings.day.temperature, doc["day"]["temperature"]);
      loadIfAvaliable(new_settings.day.humidity, doc["day"]["humidity"]);
      loadIfAvaliable(new_settings.night.temperature, doc["night"]["temperature"]);
      loadIfAvaliable(new_settings.night.humidity, doc["night"]["humidity"]);
      loadIfAvaliable(new_settings.lights.sunrise, doc["lights"]["sunrise"]);
      loadIfAvaliable(new_settings.lights.sunset, doc["lights"]["sunset"]);
      loadIfAvaliable(new_settings.lights.limit, doc["lights"]["limit"]);
      loadIfAvaliable(new_settings.lights.maintenanceOn, doc["lights"]["maintenanceOn"]);
      loadIfAvaliable(new_settings.fans.external, doc["fans"]["external"]);
      loadIfAvaliable(new_settings.fans.internal, doc["fans"]["internal"]);
    }

    Serial.printf("#################################################\n\r");
    Serial.printf("new_settings.workmode: %s\n\r", new_settings.workmode);
    Serial.printf("new_settings.daynight.day: %lu\n\r", new_settings.daynight.day);
    Serial.printf("new_settings.daynight.night: %lu\n\r", new_settings.daynight.night);
    Serial.printf("new_settings.co2.target: %.0f\n\r", new_settings.co2.target);
    Serial.printf("new_settings.day.temperature: %.2f\n\r", new_settings.day.temperature);
    Serial.printf("new_settings.day.humidity: %.0f\n\r", new_settings.day.humidity);
    Serial.printf("new_settings.night.temperature: %.2f\n\r", new_settings.night.temperature);
    Serial.printf("new_settings.night.humidity: %.0f\n\r", new_settings.night.humidity);
    Serial.printf("new_settings.lights.sunrise: %f\n\r", new_settings.lights.sunrise);
    Serial.printf("new_settings.lights.sunset: %f\n\r", new_settings.lights.sunset);
    Serial.printf("new_settings.lights.limit: %f\n\r", new_settings.lights.limit);
    Serial.printf("new_settings.lights.maintenanceOn: %f\n\r", new_settings.lights.maintenanceOn);
    Serial.printf("new_settings.fans.external: %f\n\r", new_settings.fans.external);
    Serial.printf("new_settings.fans.internal: %f\n\r", new_settings.fans.internal);
    Serial.printf("#################################################\n\r");

    settings = new_settings;
  }

  void FridgeController::saveAndUploadSettings() {
    DynamicJsonDocument doc(2048);

    doc["workmode"] = settings.workmode;
    doc["daynight"]["day"] = settings.daynight.day;
    doc["daynight"]["night"] = settings.daynight.night;
    doc["co2"]["target"] = settings.co2.target;
    doc["day"]["temperature"] = settings.day.temperature;
    doc["day"]["humidity"] = settings.day.humidity;
    doc["night"]["temperature"] = settings.night.temperature;
    doc["night"]["humidity"] = settings.night.humidity;
    doc["lights"]["sunrise"] = settings.lights.sunrise;
    doc["lights"]["sunset"] = settings.lights.sunset;
    doc["lights"]["limit"] = settings.lights.limit;
    doc["lights"]["maintenanceOn"] = settings.lights.maintenanceOn;
    doc["fans"]["external"] = settings.fans.external;
    doc["fans"]["internal"] = settings.fans.internal;


    std::stringstream stream;
    serializeJson(doc, stream);

    Serial.println(stream.str().c_str());
    fg::settings().setStr("config", stream.str().c_str());
    fg::settings().commit();
    cloud.updateConfig(stream.str().c_str());
  }

  void FridgeController::init() {
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
      if(command["action"] && command["action"] == std::string("test")) {
        testmode_duration = TESTMODE_MAX_DURATION;

        testmode_heater_power = command["outputs"]["heater"].as<float>();
        out_dehumidifier.set(command["outputs"]["dehumidifier"].as<uint8_t>());
        out_co2.set(command["outputs"]["co2"].as<uint8_t>());
        out_light.set(command["outputs"]["lights"].as<float>() * 2.55);
        out_fan_internal.set(command["outputs"]["fanint"].as<float>() * 2.55);
        out_fan_external.set(command["outputs"]["fanext"].as<float>() * 2.55);
        out_fan_backwall.set(command["outputs"]["fanbw"].as<float>() * 2.55);

        Serial.print("TEST HEATER:       ");
        Serial.println(command["outputs"]["heater"].as<uint8_t>());
        Serial.print("TEST DEHUMIDIFIER: ");
        Serial.println(command["outputs"]["dehumidifier"].as<uint8_t>());
        Serial.print("TEST CO2:          ");
        Serial.println(command["outputs"]["co2"].as<uint8_t>());
        Serial.print("TEST LIGHTS:       ");
        Serial.println(command["outputs"]["lights"].as<float>());
        Serial.print("TEST FANS INTERNAL:       ");
        Serial.println(command["outputs"]["fanint"].as<float>());
        Serial.print("TEST FANS EXTERNAL:       ");
        Serial.println(command["outputs"]["fanext"].as<float>());
        Serial.print("TEST FANS BACKWALL:       ");
        Serial.println(command["outputs"]["fanbw"].as<float>());
      }
      else if(command["action"] && command["action"] == std::string("stoptest")) {
        testmode_duration = 0;
      } else if(command["action"] && command["action"] == std::string("maintenance")) {
        float durationMinutes = command["durationMinutes"].as<float>();
        char buf[64];
        pause_until_tick = xTaskGetTickCount() + configTICK_RATE_HZ * durationMinutes * 60;
        snprintf(buf, sizeof(buf), "message-maintenance-mode-activated-remote:%d", (int)roundf(durationMinutes));
        cloud.log(buf);
      }
    });

    cloud.onUpdate([&](bool updating) {
      if(updating) {
        out_heater.set(0);
        out_dehumidifier.set(0);
        out_co2.set(0);
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
        if(output.first == std::string("co2")) {
          auto co2 = atoi(output.second.c_str());
          if(co2 != 0) {
            co2_valve_close = xTaskGetTickCount() + co2;
            state.out_co2 = 1;
            out_co2.set(1);
          }
        }
        if(output.first == std::string("light")) {
          auto lights = atof(output.second.c_str());
          state.out_light = lights;
          out_light.set(lights * 255.0f);
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

    scd4x.begin(Wire);

    unsigned  error = scd4x.stopPeriodicMeasurement();
    if (error) {
        Serial.print("Error trying to execute stopPeriodicMeasurement(): ");
        // errorToString(error, errorMessage, 256);
        // Serial.println(errorMessage);
    }

    error = scd4x.setAutomaticSelfCalibration(0);
    if (error) {
        Serial.print("Error trying to execute setAutomaticSelfCalibration(): ");
        // errorToString(error, errorMessage, 256);
        // Serial.println(errorMessage);
    }

    // Start Measurement
    error = scd4x.startPeriodicMeasurement();
    if (error) {
        Serial.print("Error trying to execute startPeriodicMeasurement(): ");
        // errorToString(error, errorMessage, 256);
        // Serial.println(errorMessage);
    }

    Serial.println("Waiting for first measurement... (5 sec)");

    co2_inject_end = xTaskGetTickCount() + CO2_INJECT_DELAY;
  }

  void FridgeController::fastloop() {
    if(heater_turn_off < xTaskGetTickCount()) {
      out_heater.set(0);
    }
    if(testmode_duration == 0) {
      if(co2_valve_close < xTaskGetTickCount()) {
        out_co2.set(0);
      }
    }
  }

  void FridgeController::loop() {
    updateSensors();
    checkDayCycle();

    if(testmode_duration > 0) {
      testmode_duration--;
      Serial.println("TESTMODE ACTIVE!");
      if(heater_temp < HEATER_MAX_TEMPERATURE) {
        heater_turn_off = (float)xTaskGetTickCount() + (float)configTICK_RATE_HZ * testmode_heater_power / 100.0;
        out_heater.set(1);
      }
      else {
        out_heater.set(0);
        Serial.println("!!!!!!!!   HEATER THROTTLING !!!!!!!!!!");
      }
    }
    else if(settings.mqttcontrol) {
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
      out_co2.set(0);
      state.out_co2 = 0;
      out_light.set(0);
      state.out_light = 0;
    }
    else {
      if(settings.workmode == FridgeControllerSettings::MODE_FULL) {
        Serial.println("MODE FULL");
        fridge_off_fanspeed = 0;
        fridge_on_fanspeed = 255;
        controlCo2();
        controlLight();
        controlDehumidifier();
        controlHeater();
        out_fan_external.set(settings.fans.external * 2.55);
      }
      else if(settings.workmode == FridgeControllerSettings::MODE_SMALL) {
        Serial.println("MODE SMALL");
        fridge_off_fanspeed = 128;
        fridge_on_fanspeed = 255;
        controlCo2();
        controlLight();
        controlDehumidifier();
        controlHeater();
        out_fan_external.set(settings.fans.external * 2.55);
      }
      // else if(settings.workmode == FridgeControllerSettings::MODE_EXP) {
      //   Serial.println("MODE EXPERIMENTAL");
      //   controlCo2();
      //   controlLight();
      //   controlDehumidifierExperimental();
      //   controlHeater();
      // }
      else if(settings.workmode == FridgeControllerSettings::MODE_TEMP) {
        Serial.println("MODE TEMP");
        controlLight();
        controlCooling();
        controlHeater();
        controlCo2();
        out_fan_external.set(settings.fans.external * 2.55);
      }
      else if(settings.workmode == FridgeControllerSettings::MODE_DRY) {
        Serial.println("MODE DRY");
        controlDehumidifier();
        controlHeater();
        out_co2.set(0);
        state.out_co2 = 0;
        out_light.set(0);
        state.out_light = 0;
        out_fan_external.set(settings.fans.external * 2.55);
      }
      else if(settings.workmode == FridgeControllerSettings::MODE_BREED) {
        Serial.println("MODE BREED");
        controlHeater();
        controlCooling();
        out_co2.set(0);
        state.out_co2 = 0;
        out_light.set(0);
        state.out_light = 0;
        out_fan_external.set(settings.fans.external * 2.55);
      }
      else {
        Serial.println("MODE OFF");
        out_heater.set(0);
        state.out_heater = 0;
        out_dehumidifier.set(0);
        state.out_dehumidifier = 0;
        out_co2.set(0);
        state.out_co2 = 0;
        out_light.set(0);
        state.out_light = 0;

        out_fan_internal.set(0);
        out_fan_external.set(0);
        out_fan_backwall.set(0);
      }

      if(state.co2 < CO2_LEVEL_CRITICAL) {
        if(++co2_low_count >= 60) {
          if(!co2_warning_triggered) {
            cloud.log("message-co2-low");
            co2_warning_triggered = true;
          }
        }
      }
      else {
        co2_low_count = 0;
        co2_warning_triggered = true;
      }
    }



    Serial.printf("%s T:%.2f°C H:%.0f%% CO2:%.0fppm H:%.2f D:%.0f L:%.0f C:%.0f\n\r",
      state.is_day ? "DAY" : "NIGHT", state.temperature, state.humidity, state.co2,
      state.out_heater, state.out_dehumidifier, state.out_light, state.out_co2);

    DynamicJsonDocument status(1024);

    status["sensors"]["temperature"] = state.temperature;
    status["sensors"]["humidity"] = state.humidity;
    status["sensors"]["co2"] = state.co2;

    if(state.out_co2) {
      status["outputs"]["co2"] = 1;
      state.out_co2 = 0;
    }
    else {
      status["outputs"]["co2"] = 0;
    }
    status["outputs"]["dehumidifier"] = state.out_dehumidifier;
    status["outputs"]["heater"] = state.out_heater;
    status["outputs"]["light"] = state.out_light;

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
    FridgeControllerSettings::MODE_OFF,
    FridgeControllerSettings::MODE_BREED,
    FridgeControllerSettings::MODE_TEMP,
    FridgeControllerSettings::MODE_SMALL,
    FridgeControllerSettings::MODE_FULL,
    FridgeControllerSettings::MODE_DRY,
  };

  void FridgeController::initSettingsMenu(UserInterface* ui) {


    auto menu = ui->push<SelectMenu>();

    menu->addOption("Dashboard", ICON_DASHBOARD, [ui, this](){ ui->pop(); });

    menu->addOption("Maintenance mode", ICON_SETTINGS, [ui, this](){
      ui->push<FloatInput>("Pause fridge for", 30, "min", 0, 120, 5, 0, [ui, this](float value) {
        char buf[64];

        pause_until_tick = xTaskGetTickCount() + configTICK_RATE_HZ * value * 60;
        snprintf(buf, sizeof(buf), "message-maintenance-mode-activated:%d", (int)roundf(value));
        cloud.log(buf);
        ui->pop();
        ui->pop();

        if (value > 0) {
          snprintf(buf, sizeof(buf), " CO2, Fridge & Heater \n  paused for %d mins  ", (int)roundf(value));
        }
        else {
          snprintf(buf, sizeof(buf), "  Maintenance mode  \n     deactivated");;
        }
        ui->push<TextDisplay>(buf, 1, [ui, this](){
          ui->pop();
        });
      });
    });

    // if(!cloud.directMode()) {

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

      menu->addOption("Control Mode", ICON_SETTINGS, [ui, this](){
        int mode = 0;
        for(int i = 0; i < modes.size(); i++) {
          if(settings.workmode == modes[i]) {
            mode = i;
            break;
          }
        }

        ui->push<SelectInput>("Control Mode", mode, std::vector<std::string>{"OFF", "Germination", "Greenhouse", "Small Plant", "Big Plant", "Drying"}, [ui, this](uint32_t mode) {

          settings.workmode = modes[mode];
          Serial.print("MODE:");
          Serial.println(settings.workmode);
          ui->pop();
          ui->pop();
          initSettingsMenu(ui);
          saveAndUploadSettings();
        });
      });

      if(settings.workmode == FridgeControllerSettings::MODE_BREED || settings.workmode == FridgeControllerSettings::MODE_DRY) {
        menu->addOption("Temperature", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("Temperature", settings.night.temperature, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.night.temperature = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }
      if(settings.workmode == FridgeControllerSettings::MODE_TEMP || settings.workmode == FridgeControllerSettings::MODE_FULL || settings.workmode == FridgeControllerSettings::MODE_SMALL) {
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

        menu->addOption("Day Temperature", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("Day Temperature", settings.day.temperature, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.day.temperature = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
        menu->addOption("Night Temperature", ICON_TEMPERATURE, [ui, this](){
          ui->push<FloatInput>("Night Temperature", settings.night.temperature, "C", 0, 40, 1, 0, [ui, this](float value) {
            settings.night.temperature = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }

      if(settings.workmode == FridgeControllerSettings::MODE_FULL || settings.workmode == FridgeControllerSettings::MODE_SMALL || settings.workmode == FridgeControllerSettings::MODE_DRY) {
        menu->addOption("Day Humidity", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("Day Humidity", settings.day.humidity, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.day.humidity = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
        menu->addOption("Night Humidity", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("Night Humidity", settings.night.humidity, "%", 0, 100, 1, 0, [ui, this](float value) {
            settings.night.humidity = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }

      if(settings.workmode == FridgeControllerSettings::MODE_TEMP || settings.workmode == FridgeControllerSettings::MODE_FULL || settings.workmode == FridgeControllerSettings::MODE_SMALL) {
        menu->addOption("CO2", ICON_HUMIDITY, [ui, this](){
          ui->push<FloatInput>("CO2", settings.co2.target, "PPM", 100, 2000, 50, 0, [ui, this](float value) {
            settings.co2.target = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }

      if(settings.workmode == FridgeControllerSettings::MODE_TEMP || settings.workmode == FridgeControllerSettings::MODE_FULL || settings.workmode == FridgeControllerSettings::MODE_SMALL) {
        menu->addOption("Sunrise", ICON_DAY, [ui, this](){
          ui->push<FloatInput>("Sunrise", settings.lights.sunrise, "min", 0, 60, 1, 0, [ui, this](float value) {
            settings.lights.sunrise = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
        menu->addOption("Sunset", ICON_NIGHT, [ui, this](){
          ui->push<FloatInput>("Sunset", settings.lights.sunset, "min", 0, 60, 1, 0, [ui, this](float value) {
            settings.lights.sunset = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
        menu->addOption("Max Light", ICON_DAY, [ui, this](){
          ui->push<FloatInput>("Max Light", settings.lights.limit, "%", 0, 100, 5, 0, [ui, this](float value) {
            settings.lights.limit = value;
            saveAndUploadSettings();
            ui->pop();
          });
        });
      }

    // }


    menu->addOption("WiFi Connection", ICON_WIFI_FULL, [ui, this](){
      showWifiUi(ui, &cloud);
    });
  }

  void FridgeController::initStatusMenu(UserInterface* ui) {
    ui->push<Dashboard>(&state.temperature, &state.humidity, &state.co2, &state.out_heater, &state.out_dehumidifier, &state.out_light, &state.out_co2, &state.is_day)
    ->onEnter([ui, this](){
      initSettingsMenu(ui);
    });
  }

}
