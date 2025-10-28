#pragma once

#include "fridgecloud.h"
#include <SensirionI2CScd4x.h>
#include "SHTSensor.h"
#include "output.h"
#include "automation.h"

#include "fghmi.h"
#include "pid.h"


namespace fg {

  struct FridgeControllerSettings {

    static constexpr const char* MODE_FULL = "full";
    static constexpr const char* MODE_SMALL = "small";
    static constexpr const char* MODE_TEMP = "temp";
    static constexpr const char* MODE_DRY = "dry";
    static constexpr const char* MODE_BREED = "breed";
    static constexpr const char* MODE_OFF = "off";
    static constexpr const char* MODE_EXP = "exp";

    bool mqttcontrol = false;

    struct {
      uint32_t day = 21600;
      uint32_t night = 79200;
    } daynight;

    struct {
      float target = 300;
    } co2;

    struct {
      float temperature = 25.0;
      float humidity = 60.0;
    } day;

    struct {
      float temperature = 25.0;
      float humidity = 60.0;
    } night;

    String workmode = MODE_OFF;

    struct {
      float sunrise = 15.0;
      float sunset = 15.0;
      float limit = 100.0;
    } lights;

    struct {
      float external = 100.0;
      float internal = 100.0;
    } fans;

    void print() const;

  };


  class FridgeController : public AutomationController {
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
    static constexpr int MINIMAL_DEHUMIDIFIER_OFF_TIME = 240;

    static constexpr double HEATER_MAX_TEMPERATURE = 80.0;
    static constexpr double HEATER_PID_P = 0.5;
    static constexpr double HEATER_PID_I = 0.001;
    static constexpr double HEATER_PID_D = 100.0;
    static constexpr double HEATER_FANRAMP_START_TEMP = 30.0;
    static constexpr double HEATER_FANRAMP_END_TEMP = 60.0;

    static constexpr TickType_t CO2_INJECT_PERIOD = configTICK_RATE_HZ * 120.0;
    static constexpr TickType_t CO2_INJECT_DURATION = configTICK_RATE_HZ * 0.2;
    static constexpr TickType_t CO2_INJECT_MAX_DURATION = configTICK_RATE_HZ * 10;
    static constexpr TickType_t CO2_INJECT_DELAY = configTICK_RATE_HZ * 120.0;
    static constexpr uint32_t CO2_INJECT_MAX_COUNT = CO2_INJECT_MAX_DURATION / CO2_INJECT_DURATION;
    static constexpr float CO2_LEVEL_CRITICAL = 200.0;
    static constexpr float CO2_OVERSWING_ABORT = 300.0;

    static constexpr float MAX_SENSOR_DEVIATION = 15.0;

    static constexpr TickType_t DIRECTMODE_TIMEOUT = configTICK_RATE_HZ * 60;

    static constexpr unsigned int TESTMODE_MAX_DURATION = 10; // times 10sec
    unsigned int testmode_duration = 0;
    float testmode_heater_power = 0;
    float directmode_fan_internal = 0.0f;

    Fridgecloud& cloud;
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
    uint32_t co2_inject_count = 1;
    uint8_t co2_low_count = 0;

    TickType_t co2_inject_end = 0;
    TickType_t co2_valve_close = 0;

    TickType_t directmode_timer = 0;

    Avg<100> humidity_avg;
    Avg<20> co2_avg;
    Avg<10> heater_avg;

    FridgeControllerSettings settings;

    bool is_legacy_board = false;
    bool sensors_valid = false;
    bool co2_warning_triggered = false;
    bool sensor_deviation_logged = false;
    bool sensor_fail_logged = false;

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
    } state;

    double heater_temp;
    TickType_t heater_turn_off;

    Pid heater_day_pid;
    Pid heater_night_pid;

    void updateSensors();
    void checkDayCycle();
    void controlCo2();
    void controlLight();
    void controlDehumidifier();
    void controlDehumidifierExperimental();
    void controlCooling();
    void controlHeater();

  public:
    FridgeController(Fridgecloud& cloud);
    void init() override;
    void loop() override;
    void fastloop() override;
    void initStatusMenu(UserInterface* ui) override;
    void initSettingsMenu(UserInterface* ui) override;
    void loadSettings(const String& settings);
    void saveAndUploadSettings();

  };

}
