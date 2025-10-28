#pragma once

#include "fridgecloud.h"
#include <SensirionI2CScd4x.h>
#include "SHTSensor.h"
#include "output.h"
#include "automation.h"

#include "fghmi.h"
#include "pid.h"


namespace fg {


  class FridgeController : public TestingController {
    static constexpr uint8_t PIN_HEATER = 33;
    static constexpr uint8_t PIN_DEHUMIDIFIER = 19;
    static constexpr uint8_t PIN_CO2 = 18;
    static constexpr uint8_t PIN_LIGHT = 21;

    static constexpr uint8_t PIN_NTC1 = 36;
    static constexpr uint8_t PIN_NTC2 = 39;
    static constexpr uint8_t PIN_NTC3 = 34;
    static constexpr uint8_t PIN_NTC4 = 35;

    static constexpr uint8_t PIN_SDA = 23;
    static constexpr uint8_t PIN_SCL = 22;

    static constexpr uint8_t PIN_FAN_INTERNAL = 4;
    static constexpr uint8_t PIN_FAN_EXTERNAL = 5;
    static constexpr uint8_t PIN_FAN_BACKWALL = 2;

    static constexpr uint8_t PIN_SENSOR_I2CSCL = 26;
    static constexpr uint8_t PIN_SENSOR_I2CSDA = 15;
    static constexpr uint32_t SENSOR_I2C_FRQ = 10000;


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
    SensirionI2CScd4x scd4x;
    SHTSensor sht21;

    PinOutput out_heater;
    PinOutput out_dehumidifier;
    PinOutput out_co2;
    PwmOutput out_light;
    PwmOutput out_fan_internal;
    PwmOutput out_fan_external;
    PwmOutput out_fan_backwall;

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
      float co2 = 0;

      float out_heater = 0;
      float out_dehumidifier = 0;
      float out_light = 0;
      float out_co2 = 0;

      float ntc1 = 0;
      float ntc2 = 0;
      float ntc3 = 0;
      float ntc4 = 0;
    } state;

    double heater_temp;
    TickType_t heater_turn_off;

    Pid heater_day_pid;
    Pid heater_night_pid;

    static constexpr unsigned TEST_NONE = 0;
    static constexpr unsigned TEST_HEATER = 1;
    static constexpr unsigned TEST_FANINT = 2;
    static constexpr unsigned TEST_FANEXT = 3;
    static constexpr unsigned TEST_FANBW = 4;
    static constexpr unsigned TEST_LIGHT = 5;
    static constexpr unsigned TEST_VENT = 6;

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
    void testphase9();
    void testphase10();

  public:
    FridgeController(UserInterface* ui);
    void init() override;
    void loop() override;
    void fastloop() override;
  };

}
