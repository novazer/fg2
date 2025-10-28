#pragma once

#include "fridgecloud.h"
#include <SensirionI2CScd4x.h>
#include "SHTSensor.h"
#include "output.h"
#include "automation.h"
#include "daisychain.h"

#include "fghmi.h"
#include "pid.h"


namespace fg {

  struct PlugControllerSettings {

    struct Timerslot {
      uint32_t ontime;
      uint32_t duration;
    };

    static constexpr const char* MODE_TIMER = "timer";
    static constexpr const char* MODE_HEAT = "heater";
    static constexpr const char* MODE_COOL = "cooler";
    static constexpr const char* MODE_HUMIDIFY = "humidify";
    static constexpr const char* MODE_DEHUMIDIFY = "dehumidify";
    static constexpr const char* MODE_CO2 = "co2";
    static constexpr const char* MODE_WATERING = "watering";
    static constexpr const char* MODE_OFF = "off";

    static constexpr const char* CO2MODE_CONST = "const";
    static constexpr const char* CO2MODE_PERIODIC = "periodic";

    bool mqttcontrol = false;

    bool usedaynight = false;
    struct {
      uint32_t day = 21600;
      uint32_t night = 79200;
    } daynight;

    struct {
      std::vector<Timerslot> timeframes;
    } timer;

    struct {
      struct {
        float on = 25.0;
        float off = 30.0;
      } day;
      struct {
        float on = 25.0;
        float off = 30.0;
      } night;
    } heater;

    struct {
      struct {
        float on = 25.0;
        float off = 30.0;
      } day;
      struct {
        float on = 25.0;
        float off = 30.0;
      } night;
    } cooler;

    struct {
      struct {
        float on = 25.0;
        float off = 30.0;
      } day;
      struct {
        float on = 25.0;
        float off = 30.0;
      } night;
    } humidify;

    struct {
      struct {
        float on = 25.0;
        float off = 30.0;
      } day;
      struct {
        float on = 25.0;
        float off = 30.0;
      } night;
    } dehumidify;
    struct {
      String mode = CO2MODE_CONST;
      uint32_t period = 60;
      uint32_t duration = 10;
      float on = 600;
      float off = 1000;
    } co2;

    struct {
      struct {
        bool enabled;
        float limit;
        float hysteresis;
      } overtemperature;

      struct {
        bool enabled;
        float limit;
        float hysteresis;
      } undertemperature;

      struct {
        bool enabled;
        float min_on;
        float min_off;
      } time;
    } limits;

    String workmode = MODE_OFF;
    String fan = "";

    void print() const;
  };


  class PlugController : public AutomationController {
    static constexpr uint8_t PIN_RELAIS = 21;

    static constexpr uint8_t PIN_SDA = 23;
    static constexpr uint8_t PIN_SCL = 22;

    static constexpr uint8_t PIN_SENSOR_I2CSCL = 4;
    static constexpr uint8_t PIN_SENSOR_I2CSDA = 15;
    static constexpr uint32_t SENSOR_I2C_FRQ = 10000;

    static constexpr uint8_t PIN_SLAVE_I2CSCL = 12;
    static constexpr uint8_t PIN_SLAVE_I2CSDA = 13;
    static constexpr uint32_t SLAVE_I2C_FRQ = 10000;

    static constexpr double HEATER_MAX_TEMPERATURE = 80.0;
    static constexpr double HEATER_PID_P = 0.5;
    static constexpr double HEATER_PID_I = 0.001;
    static constexpr double HEATER_PID_D = 100.0;

    static constexpr uint8_t SENSOR_TYPE_NONE = 0;
    static constexpr uint8_t SENSOR_TYPE_SHT = 1;
    static constexpr uint8_t SENSOR_TYPE_SCD = 2;
    static constexpr uint8_t SENSOR_TYPE_SLAVE = 3;

    static constexpr TickType_t CO2_INJECT_PERIOD = configTICK_RATE_HZ * 300.0;
    static constexpr TickType_t CO2_INJECT_DURATION = configTICK_RATE_HZ * 0.25;
    static constexpr TickType_t CO2_INJECT_DELAY = configTICK_RATE_HZ * 300.0;
    static constexpr float CO2_LEVEL_CRITICAL = 200.0;

    static constexpr unsigned int TESTMODE_MAX_DURATION = 10; // times 10sec
    unsigned int testmode_duration = 0;
    float testmode_heater_power = 0;

    static constexpr TickType_t DIRECTMODE_TIMEOUT = configTICK_RATE_HZ * 60;
    TickType_t directmode_timer = 0;


    Fridgecloud& cloud;
    SensirionI2CScd4x scd4x;
    SHTSensor sht21;

    DaisyMaster daisymaster;
    DaisySlave daisyslave;

    // PinOutput out_heater;
    // PinOutput out_dehumidifier;
    // PinOutput out_co2;
    // PwmOutput out_light;
    // PwmOutput out_fan_internal;
    // PwmOutput out_fan_external;
    // PwmOutput out_fan_backwall;

    PinOutput out_relais;

    float co2_turnoff_value = 0.0f;
    uint32_t co2_turnoff_time = 0;
    uint32_t stuck_count = 0;

    TickType_t co2_inject_start = 0;

    Avg<300> humidity_avg;
    // Avg<300> co2_avg;

    PlugControllerSettings settings;

    bool is_legacy_board = false;
    bool sensors_valid = false;
    bool co2_warning_triggered = false;
    uint8_t co2_low_count = 0;

    uint8_t fridge_on_fanspeed = 255;
    uint8_t fridge_off_fanspeed = 255;

    struct {
      bool is_day;
      uint32_t timeofday;

      uint8_t sensor_type = 0;

      float temperature = 0;
      float humidity = 0;
      float co2 = 0;

      float out = 0;
    } state;

    double heater_temp;
    TickType_t heater_turn_off;

    Pid heater_day_pid;
    Pid heater_night_pid;

    void updateSensors();
    void checkDayCycle();
    void controlHumidifier();
    void controlDehumidifier();
    void controlCooler();
    void controlHeater();
    void controlCo2();
    void controlTimer();
    bool initSensor();

    void checkLimits(uint8_t output);

  public:
    PlugController(Fridgecloud& cloud);
    void init() override;
    void loop() override;
    void fastloop() override;
    void initStatusMenu(UserInterface* ui) override;
    void initSettingsMenu(UserInterface* ui) override;
    void loadSettings(const String& settings);
    void saveAndUploadSettings();

  };

}
