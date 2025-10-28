#include "output.h"

#include "Arduino.h"

namespace fg {

  PinOutput::PinOutput(uint8_t pin, uint8_t default_value) {
    current_value = default_value;
    this->pin = pin;
    pinMode(pin, OUTPUT);
    digitalWrite(pin, current_value);
  }

  void PinOutput::set(uint8_t value) {
    digitalWrite(pin, value);
    current_value = value;
  }

  uint8_t PinOutput::get() {
    return current_value;
  }

  PwmOutput::PwmOutput(uint8_t pin, uint8_t channel, uint8_t default_value) {
    current_value = default_value;
    this->channel = channel;
    ledcSetup(channel, 1000, 8);
    ledcAttachPin(pin, channel);
  }

  PwmOutput::PwmOutput(uint8_t pin, uint8_t channel, uint8_t default_value, uint32_t freq) {
    current_value = default_value;
    this->channel = channel;
    ledcSetup(channel, freq, 8);
    ledcAttachPin(pin, channel);
  }

  void PwmOutput::set(uint8_t value) {
    current_value = value;
    ledcWrite(channel, value);
  }

  uint8_t PwmOutput::get() {
    return current_value;
  }

}