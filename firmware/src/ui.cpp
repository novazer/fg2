#include "ui.h"
#include "Arduino.h"

namespace fg {

  void ui_init() {
    pinMode(PIN_LED_HW_G, OUTPUT);
    pinMode(PIN_LED_HW_R, OUTPUT);
    pinMode(PIN_LED_WIFI_G, OUTPUT);
    pinMode(PIN_LED_WIFI_R, OUTPUT);
    pinMode(PIN_BTN, INPUT);
  }

  void setHwLed(LedStatus status) {
    switch(status) {
      case LedStatus::OK :
        digitalWrite(PIN_LED_HW_G, HIGH);
        digitalWrite(PIN_LED_HW_R, LOW);
        break;
      case LedStatus::WARN :
        digitalWrite(PIN_LED_HW_G, HIGH);
        digitalWrite(PIN_LED_HW_R, HIGH);
        break;
      case LedStatus::ERR :
        digitalWrite(PIN_LED_HW_G, LOW);
        digitalWrite(PIN_LED_HW_R, HIGH);
        break;
    }
  }

  void setWifiLed(LedStatus status) {
    switch(status) {
      case LedStatus::OK :
        digitalWrite(PIN_LED_WIFI_G, HIGH);
        digitalWrite(PIN_LED_WIFI_R, LOW);
        break;
      case LedStatus::WARN :
        digitalWrite(PIN_LED_WIFI_G, HIGH);
        digitalWrite(PIN_LED_WIFI_R, HIGH);
        break;
      case LedStatus::ERR :
        digitalWrite(PIN_LED_WIFI_G, LOW);
        digitalWrite(PIN_LED_WIFI_R, HIGH);
        break;
    }
  }

  bool buttonIsPressed() {
    return digitalRead(PIN_BTN) == 0;
  }

}