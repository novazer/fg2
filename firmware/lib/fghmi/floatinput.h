#pragma once

#include "userinterface.h"

namespace fg {

  class FloatInput: public MenuItem {
    std::string name;
    float value;
    std::string unit;
    float min, max, step, precision;
    std::function<void(float)> listener;

  public:
    FloatInput(std::string name, float value, std::string unit, float min, float max, float step, float precision, std::function<void(float)> listener);
    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };
}