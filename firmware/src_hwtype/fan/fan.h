#pragma once

#include "automation.h"
#include "output.h"
#include "SHTSensor.h"

namespace fg {

  struct FanControllerSettings {
    static constexpr uint8_t MODE_FIXED = 0;
    static constexpr uint8_t MODE_TEMPERATURE = 1;
    static constexpr uint8_t MODE_HUMIDITY = 2;
    static constexpr uint8_t MODE_BOTH = 3;

    bool mqttcontrol = false;

    uint32_t mode = MODE_FIXED;

    struct {
      float temperature = 25.0;
      float humidity = 60;
      float fixed_speed = 100;
      float max_speed = 100;
    } day;
    struct {
      float temperature = 25.0;
      float humidity = 60;
      float fixed_speed = 100;
      float max_speed = 100;
    } night;

    struct {
      bool enabled = false;
      float speed = 100;
      bool usedaynight = false;
      uint32_t day = 21600;
      uint32_t night = 79200;
      uint32_t period = 60;
      uint32_t duration = 10;
    } co2inject;

    float min_speed = 100;
  };

  class FanController  : public AutomationController {
    static constexpr uint8_t PIN_FAN = 21;
    static constexpr uint8_t PIN_LIGHTSENSOR = 33;
    static constexpr uint8_t PIN_RPM = 19;

    static constexpr uint8_t PIN_SDA = 23;
    static constexpr uint8_t PIN_SCL = 22;
    static constexpr uint8_t PIN_SENSOR_I2CSCL = 4;
    static constexpr uint8_t PIN_SENSOR_I2CSDA = 15;
    static constexpr uint32_t SENSOR_I2C_FRQ = 10000;

    static constexpr uint32_t THRESHHOLD_DAYLIGHT = 128;

    static constexpr TickType_t SETTING_UPLOAD_DELAY = 1000;

    static constexpr float HALF_HYST_TEMPERATURE = 1.0f;
    static constexpr float HALF_HYST_HUMIDITY = 5.0f;

    static constexpr unsigned int TESTMODE_MAX_DURATION = 10; // times 10sec

    static constexpr float controlspeed = 0.01;

    static constexpr TickType_t DIRECTMODE_TIMEOUT = configTICK_RATE_HZ * 60;
    TickType_t directmode_timer = 0;

    FanControllerSettings settings;
    struct {
      bool is_day;
      uint32_t timeofday;

      float temperature = 20;
      float humidity = 20;

      float fanspeed = 0;
      float rpm = 0;
      float optical = 0;
    } state;

    fg::MenuItem* mode;
    fg::MenuItem* day_speed;
    fg::MenuItem* night_speed;
    fg::MenuItem* day_temp;
    fg::MenuItem* night_temp;
    fg::MenuItem* day_hum;
    fg::MenuItem* night_hum;
    fg::MenuItem* min_speed;
    fg::MenuItem* max_speed_day;
    fg::MenuItem* max_speed_night;

    TickType_t last_menu_update = 0;

    unsigned int testmode_duration = 0;
    Fridgecloud& cloud;
    SHTSensor sht;

    PwmOutput out_fan;

    void updateSensors();
    void checkDayCycle();
    void controlFan();
    void saveAnduploadSettings();
    void loadSettings(const String& settings);

  public:
    FanController(Fridgecloud& cloud);
    void init() override;
    void loop() override;
    void fastloop() override;
    void initStatusMenu(UserInterface* ui) override;
    void initSettingsMenu(UserInterface* ui) override;
  };

}