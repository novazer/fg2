#pragma once

#include "fridgecloud.h"
#include "SHTSensor.h"
#include "output.h"
#include "automation.h"

#include "fghmi.h"
#include "pid.h"


namespace fg {

  struct DryerControllerSettings {

    static constexpr const char* MODE_DRY = "dry";
    static constexpr const char* MODE_OFF = "off";

    bool mqttcontrol = false;
    String workmode = MODE_OFF;

    float temperature = 25.0;
    float humidity = 60.0;

    struct {
      float external = 100.0;
      float internal = 100.0;
    } fans;

    void print() const;
  };


  class DryerController : public AutomationController {
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

    static constexpr int MINIMAL_DEHUMIDIFIER_OFF_TIME = 240;

    static constexpr double HEATER_MAX_TEMPERATURE = 80.0;
    static constexpr double HEATER_PID_P = 0.5;
    static constexpr double HEATER_PID_I = 0.001;
    static constexpr double HEATER_PID_D = 100.0;
    static constexpr double HEATER_FANRAMP_START_TEMP = 30.0;
    static constexpr double HEATER_FANRAMP_END_TEMP = 60.0;

    static constexpr float MAX_SENSOR_DEVIATION = 15.0;

    static constexpr TickType_t DIRECTMODE_TIMEOUT = configTICK_RATE_HZ * 60;

    static constexpr unsigned int TESTMODE_MAX_DURATION = 10; // times 10sec
    unsigned int testmode_duration = 0;
    float testmode_heater_power = 0;
    float directmode_fan_internal = 0.0f;

    Fridgecloud& cloud;
    SHTSensor sht21;

    PinOutput out_heater;
    PinOutput out_dehumidifier;
    PwmOutput out_light;
    PwmOutput out_fan_internal;
    PwmOutput out_fan_external;
    PwmOutput out_fan_backwall;

    TickType_t directmode_timer = 0;

    Avg<100> humidity_avg;
    Avg<20> co2_avg;
    Avg<10> heater_avg;

    DryerControllerSettings settings;

    bool is_legacy_board = false;
    bool sensors_valid = false;
    bool sensor_deviation_logged = false;
    bool sensor_fail_logged = false;

    uint8_t fridge_on_fanspeed = 255;
    uint8_t fridge_off_fanspeed = 255;

    struct {
      uint32_t timeofday;

      float temperature = 0;
      float humidity = 0;

      float out_heater = 0;
      float out_dehumidifier = 0;
      float out_light = 0;
    } state;

    double heater_temp;
    TickType_t heater_turn_off;

    Pid heater_day_pid;
    Pid heater_night_pid;

    void updateSensors();
    void checkDayCycle();
    void controlDehumidifier();
    void controlDehumidifierExperimental();
    void controlCooling();
    void controlHeater();

  public:
    DryerController(Fridgecloud& cloud);
    void init() override;
    void loop() override;
    void fastloop() override;
    void initStatusMenu(UserInterface* ui) override;
    void initSettingsMenu(UserInterface* ui) override;
    void loadSettings(const String& settings);
    void saveAndUploadSettings();

  };

}
