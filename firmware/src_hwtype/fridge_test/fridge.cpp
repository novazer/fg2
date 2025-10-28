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

  std::unique_ptr<TestingController> createTestingController(UserInterface* ui) {
    return std::unique_ptr<TestingController>(new FridgeController(ui));
  }


  void FridgeController::updateSensors() {

    float temperature, humidity;
    uint16_t co2 = 0;
    char errorString[200];
    uint8_t error;

    static unsigned sht_fails = 0;
    static unsigned co2_fails = 0;
    static TickType_t last_co2_sample;

    Wire.flush();

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
      sht_fails++;
    }
    else {
      state.temperature = temperature;
      state.humidity = humidity;
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
        error = scd4x.readMeasurement(co2, temperature, humidity);
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

    state.ntc1 = ntcToTemp(ntc1);
    state.ntc2 = ntcToTemp(ntc2);
    state.ntc3 = ntcToTemp(ntc3);
    state.ntc4 = ntcToTemp(ntc4);


    Serial.printf("NTCS: %2f %2f %2f %2f\n\r", ntcToTemp(ntc1), ntcToTemp(ntc2), ntcToTemp(ntc3), ntcToTemp(ntc4));
    Serial.printf("RAW: %u %u %u %u\n\r", ntc1, ntc2, ntc3, ntc4);

    heater_temp = ntcToTemp(ntc1);
    heater_temp = ntcToTemp(ntc2) > heater_temp ? ntcToTemp(ntc2) : heater_temp;
    heater_temp = ntcToTemp(ntc3) > heater_temp ? ntcToTemp(ntc3) : heater_temp;
    heater_temp = ntcToTemp(ntc4) > heater_temp ? ntcToTemp(ntc4) : heater_temp;

    if(sht_fails < 10 && co2_fails < 10) {
      sensors_valid = true;
    }
    else {
      sensors_valid = false;
    }
  }


  FridgeController::FridgeController(UserInterface* ui) :
    ui(ui),
    out_heater(PIN_HEATER),
    out_dehumidifier(PIN_DEHUMIDIFIER),
    out_co2(PIN_CO2),
    out_light(PIN_LIGHT, 0),
    out_fan_internal(PIN_FAN_INTERNAL, 1, 255, 30000),
    out_fan_external(PIN_FAN_EXTERNAL, 2, 255, 30000),
    out_fan_backwall(PIN_FAN_BACKWALL, 3, 255, 30000),
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

  void FridgeController::init() {
    char errorString[200];
    uint8_t errorcode;

    out_fan_internal.set(0);
    out_fan_external.set(0);
    out_fan_backwall.set(0);

    pinMode(12, INPUT);
    pinMode(13, INPUT);
    pinMode(15, INPUT);
    pinMode(26, INPUT);

    pinMode(PIN_NTC1, INPUT);
    pinMode(PIN_NTC2, INPUT);
    pinMode(PIN_NTC3, INPUT);
    pinMode(PIN_NTC4, INPUT);


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
      if(sht21.init(Wire)) {
        Serial.print("LEGACY BOARD DETECTED!\n");
        is_legacy_board = true;
      }
      Serial.print("init(): failed\n");
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

    co2_inject_start = xTaskGetTickCount() + CO2_INJECT_DELAY;

    testphase1();
  }

  void FridgeController::testphase1() {
    ui->push<CheckDisplay>([&]() {
      testphase2();
    });
  }

  void FridgeController::testphase2() {
    ui->pop();
    ui->push<FloatDisplay>("check T sensor", &state.temperature, "C", 1, [&]() {
      ui->push<FloatDisplay>("check RH sensor", &state.humidity, "%", 1, [&]() {
        ui->push<FloatDisplay>("check CO2 sensor", &state.co2, "ppm", 1, [&]() {
          testphase3();
        });
      });
    });
  }

  void FridgeController::testphase3() {
    current_test = TEST_FANINT;
    out_fan_internal.set(255);
    out_fan_external.set(0);
    out_fan_backwall.set(0);
    ui->pop();
    ui->push<TextDisplay>("FAN INT", 2, [&](){
      testphase4();
    });
  }

  void FridgeController::testphase4() {
    current_test = TEST_FANEXT;
    out_fan_internal.set(0);
    out_fan_external.set(255);
    out_fan_backwall.set(0);
    ui->pop();
    ui->push<TextDisplay>("FAN EXT", 2, [&](){
      testphase5();
    });
  }

  void FridgeController::testphase5() {
    current_test = TEST_FANBW;
    out_fan_internal.set(0);
    out_fan_external.set(0);
    out_fan_backwall.set(255);
    ui->pop();
    ui->push<TextDisplay>("FAN BW", 2, [&](){
      testphase6();
    });
  }

  void FridgeController::testphase6() {
    current_test = TEST_HEATER;
    out_fan_internal.set(255);
    out_fan_external.set(0);
    out_fan_backwall.set(0);
    ui->pop();
    ui->pop();
    ui->pop();
    ui->push<HeaterCheck>(&state.ntc1, &state.ntc2, &state.ntc3, &state.ntc4, [&](){
      testphase7();
    });
  }


  void FridgeController::testphase7() {
    current_test = TEST_LIGHT;
    out_light.set(255);
    ui->pop();
    ui->push<TextDisplay>("LIGHT", 2, [&](){
      testphase8();
    });
  }

  void FridgeController::testphase8() {
    current_test = TEST_NONE;
    out_light.set(0);
    out_dehumidifier.set(1);
    ui->pop();
    ui->push<TextDisplay>("FRIDGE", 2, [&](){
      testphase9();
    });
  }

  void FridgeController::testphase9() {
    current_test = TEST_VENT;
    out_dehumidifier.set(0);
    out_co2.set(1);
    ui->pop();
    ui->push<TextDisplay>("VENT", 2, [&](){
      testphase10();
    });
  }

  void FridgeController::testphase10() {
    current_test = TEST_NONE;
    ui->pop();
    ui->push<TextDisplay>("TEST DONE", 2);
  }

  // std::vector<std::string> errors;
  //   errors.push_back("error 1");
  //   errors.push_back("error 2");
  //   ui->push<ErrorDisplay>(errors);

  void FridgeController::fastloop() {
    if(heater_turn_off < xTaskGetTickCount()) {
      out_heater.set(0);
    }
    if(testmode_duration == 0) {
      if(co2_inject_start + CO2_INJECT_DURATION < xTaskGetTickCount()) {
        out_co2.set(0);
      }
    }
  }

  void FridgeController::loop() {
    updateSensors();

    Serial.printf("%s T:%.2f°C H:%.0f%% CO2:%.0fppm H:%.2f D:%.0f L:%.0f C:%.0f\n\r",
      state.is_day ? "DAY" : "NIGHT", state.temperature, state.humidity, state.co2,
      state.out_heater, state.out_dehumidifier, state.out_light, state.out_co2);

    DynamicJsonDocument status(1024);

    status["sensors"]["temperature"] = state.temperature;
    status["sensors"]["humidity"] = state.humidity;
    status["sensors"]["co2"] = state.co2;

    status["outputs"]["co2"] = state.out_co2;
    status["outputs"]["dehumidifier"] = state.out_dehumidifier;
    status["outputs"]["heater"] = state.out_heater;
    status["outputs"]["light"] = state.out_light;

    switch(current_test) {
      case TEST_HEATER :
        heater_turn_off = (float)xTaskGetTickCount() + (float)configTICK_RATE_HZ;
        out_heater.set(1);
        break;

      case TEST_VENT :
        static TickType_t last_toggle = 0;
        if(last_toggle < xTaskGetTickCount() + configTICK_RATE_HZ) {
          last_toggle = xTaskGetTickCount();
          out_co2.set(out_co2.get() == 0 ? 1 : 0);
        }
        break;

      case TEST_NONE:
      default:
        break;
    }

    if (sntp_get_sync_status()) {
      printf("got time from sntp server\n");
      time_t now;
      struct tm timeinfo;
      time(&now);
      MCP7940.adjust(now);
    }
  }


}
