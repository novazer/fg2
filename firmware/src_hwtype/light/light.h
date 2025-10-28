#pragma once

#include "automation.h"
#include "output.h"
#include "SHTSensor.h"

#include "esp_sntp.h"


namespace fg {

  struct LightControllerSettings {
      bool mqttcontrol = false;

      uint32_t day = 21600;
      uint32_t night = 79200;
      float max_temperature = 25.0;
      float limit = 100;
      float sunrise = 0;
      float sunset = 0;
  };

  class LightController  : public AutomationController {
    static constexpr uint8_t PIN_LIGHT = 21;

    static constexpr uint8_t PIN_SDA = 23;
    static constexpr uint8_t PIN_SCL = 22;

    static constexpr uint8_t PIN_SENSOR_I2CSCL = 4;
    static constexpr uint8_t PIN_SENSOR_I2CSDA = 15;
    static constexpr uint32_t SENSOR_I2C_FRQ = 10000;

    static constexpr TickType_t SETTING_UPLOAD_DELAY = 1000;

    static constexpr float LIGHT_TEMP_HYST = 1.0f;
    static constexpr float LIGHT_CONTROL_SPEED = 0.01f;

    static constexpr TickType_t DIRECTMODE_TIMEOUT = configTICK_RATE_HZ * 60;
    TickType_t directmode_timer = 0;
    struct {
      bool is_day;
      uint32_t timeofday;

      float temperature = 20;
      float humidity = 20;

      float out_light = 0.0;
    } state;

    LightControllerSettings settings;


    TickType_t last_menu_update = 0;

    unsigned int testmode_duration = 0;
    Fridgecloud& cloud;
    SHTSensor sht;

    PwmOutput out_light;

    void updateSensors();
    void checkDayCycle();
    void controlLight();
    void saveAndUploadSettings();
    void loadSettings(const String& settings);

  public:
    LightController(Fridgecloud& cloud);
    void init() override;
    void loop() override;
    void fastloop() override;
    void initStatusMenu(UserInterface* ui) override;
    void initSettingsMenu(UserInterface* ui) override;
  };

}