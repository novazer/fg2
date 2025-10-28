#pragma once

#include <stdint.h>

namespace fg {

  enum LedStatus {
    OK, WARN, ERR
  };

  static constexpr uint8_t PIN_LED_HW_G = 14;
  static constexpr uint8_t PIN_LED_HW_R = 27;
  static constexpr uint8_t PIN_LED_WIFI_G = 26;
  static constexpr uint8_t PIN_LED_WIFI_R = 25;
  static constexpr uint8_t PIN_BTN = 12;

  void setHwLed(LedStatus status);
  void setWifiLed(LedStatus status);
  void ui_init();
  bool buttonIsPressed();

}