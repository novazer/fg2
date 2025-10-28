#pragma once

#include <stdint.h>

namespace fg {

class Output {
public:
  virtual void set(uint8_t value) = 0;
  virtual uint8_t get() = 0;
};

class PinOutput : public Output {
  uint8_t current_value;
  uint8_t pin;
public:
  PinOutput(uint8_t pin, uint8_t default_value = 0);
  void set(uint8_t value) override;
  uint8_t get() override;
};

class PwmOutput : public Output {
  uint8_t current_value;
  uint8_t pin;
  uint8_t channel;
public:
  PwmOutput(uint8_t pin, uint8_t channel, uint8_t default_value = 0);
  PwmOutput(uint8_t pin, uint8_t channel, uint8_t default_value, uint32_t freq);
  void set(uint8_t value) override;
  uint8_t get() override;
};

}