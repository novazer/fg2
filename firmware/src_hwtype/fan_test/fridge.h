#pragma once

#include "fridgecloud.h"
#include "SHTSensor.h"
#include "output.h"
#include "automation.h"

#include "fghmi.h"
#include "pid.h"


namespace fg {


  class FridgeController : public TestingController {
     static constexpr uint8_t PIN_FAN = 21;
    static constexpr uint8_t PIN_LIGHTSENSOR = 33;
    static constexpr uint8_t PIN_RPM = 19;

    static constexpr uint8_t PIN_SDA = 23;
    static constexpr uint8_t PIN_SCL = 22;
    static constexpr uint8_t PIN_SENSOR_I2CSCL = 4;
    static constexpr uint8_t PIN_SENSOR_I2CSDA = 15;
    static constexpr uint32_t SENSOR_I2C_FRQ = 10000;

    static constexpr uint32_t THRESHHOLD_DAYLIGHT = 128;



    static constexpr float LIGHT_TEMP_HYST = 1.0f;
    static constexpr float LIGHT_CONTROL_SPEED = 0.01f;

    static constexpr int CO2_SAMPLE_DELAY = 100;
    static constexpr int WARN_LEVEL_CO2_MIN = 100;
    static constexpr int MINIMAL_DEHUMIDIFIER_OFF_TIME = 180;

    static constexpr double HEATER_MAX_TEMPERATURE = 80.0;
    static constexpr double HEATER_PID_P = 0.5;
    static constexpr double HEATER_PID_I = 0.001;
    static constexpr double HEATER_PID_D = 100.0;

    static constexpr TickType_t CO2_INJECT_PERIOD = configTICK_RATE_HZ * 300.0;
    static constexpr TickType_t CO2_INJECT_DURATION = configTICK_RATE_HZ * 0.25;
    static constexpr TickType_t CO2_INJECT_DELAY = configTICK_RATE_HZ * 300.0;
    static constexpr float CO2_LEVEL_CRITICAL = 200.0;

    static constexpr unsigned int TESTMODE_MAX_DURATION = 10; // times 10sec
    unsigned int testmode_duration = 0;
    float testmode_heater_power = 0;

    UserInterface* ui;
    SHTSensor sht21;

    PwmOutput out_fan;


    float co2_turnoff_value = 0.0f;
    uint32_t co2_turnoff_time = 0;
    uint32_t stuck_count = 0;

    TickType_t co2_inject_start = 0;

    Avg<300> humidity_avg;
    Avg<300> co2_avg;


    bool is_legacy_board = false;
    bool sensors_valid = false;
    bool co2_warning_triggered = false;
    uint8_t co2_low_count = 0;

    uint8_t fridge_on_fanspeed = 255;
    uint8_t fridge_off_fanspeed = 255;

    struct {
      bool is_day;
      uint32_t timeofday;

      float temperature = 0;
      float humidity = 0;

      float optical;

    } state;

    double heater_temp;
    TickType_t heater_turn_off;

    static constexpr unsigned TEST_NONE = 0;
    static constexpr unsigned TEST_HEATER = 1;
    static constexpr unsigned TEST_FANINT = 2;
    static constexpr unsigned TEST_FANEXT = 3;
    static constexpr unsigned TEST_FANBW = 4;
    static constexpr unsigned TEST_LIGHT = 5;

    unsigned current_test = 0;

    void updateSensors();
    void checkDayCycle();
    void testphase1();
    void testphase2();
    void testphase3();
    void testphase4();
    void testphase5();
    void testphase6();
    void testphase7();
    void testphase8();

  public:
    FridgeController(UserInterface* ui);
    void init() override;
    void loop() override;
    void fastloop() override;
  };

}
