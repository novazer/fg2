#include "fridge.h"
#include "dashboard.h"
#include "wifi.h"
#include <sstream>

#include "time.h"
#include "esp_sntp.h"

const uint8_t  SPRINTF_BUFFER_SIZE{32};
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

    if(sht_fails < 10) {
      sensors_valid = true;
    }
    else {
      sensors_valid = false;
    }

    auto optical = analogRead(PIN_LIGHTSENSOR);
    state.is_day = optical > THRESHHOLD_DAYLIGHT;
    state.optical = optical;
    Serial.println(optical);
  }


  FridgeController::FridgeController(UserInterface* ui) :
    ui(ui),
    out_fan(PIN_FAN, 1, 255, 30000),
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
    Wire.begin(PIN_SDA, PIN_SCL);
    Wire1.begin(PIN_SENSOR_I2CSDA, PIN_SENSOR_I2CSCL, SENSOR_I2C_FRQ);
    delay(100);

    sntp_setoperatingmode(SNTP_OPMODE_POLL);
    sntp_setservername(0, "pool.ntp.org");
    sntp_init();

    if (sht21.init(Wire1)) {
        Serial.print("init(): success\n");
    } else {
        Serial.print("init(): failed\n");
    }
    sht21.setAccuracy(SHTSensor::SHT_ACCURACY_MEDIUM); // only supported by SHT3x

    pinMode(PIN_LIGHTSENSOR, INPUT_PULLUP);
    pinMode(PIN_RPM, INPUT_PULLUP);

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
        ui->push<FloatDisplay>("check LIGHT sensor", &state.optical, "", 1, [&]() {
          testphase3();
        });
      });
    });
  }

  void FridgeController::testphase3() {
    current_test = TEST_FANINT;
    ui->pop();
    ui->push<TextDisplay>("FAN", 2, [&](){
      testphase8();
    });
  }

  void FridgeController::testphase8() {
    current_test = TEST_NONE;
    out_fan.set(0);
    ui->pop();
    ui->push<TextDisplay>("TEST DONE", 2);
  }

  // std::vector<std::string> errors;
  //   errors.push_back("error 1");
  //   errors.push_back("error 2");
  //   ui->push<ErrorDisplay>(errors);

  void FridgeController::fastloop() {
    static TickType_t last_tick = 0;
    if(last_tick < (float)xTaskGetTickCount() + (float)configTICK_RATE_HZ / 10) {
      if(current_test == TEST_FANINT) {
        auto out = fmodf(((float)xTaskGetTickCount() / (float)configTICK_RATE_HZ / 10), 2.0f) - 1.0f;
        if(out < 0.0f) {
          out_fan.set(-255.0f * out);
        }
        else {
          out_fan.set(255.0f * out);
        }
      }
    }
  }

  void FridgeController::loop() {
    updateSensors();

    Serial.printf("%s T:%.2f°C H:%.0f%% O:%.0f\n\r",
      state.is_day ? "DAY" : "NIGHT", state.temperature, state.humidity, state.optical);


    switch(current_test) {
      case TEST_FANINT :

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
    }
  }


}
