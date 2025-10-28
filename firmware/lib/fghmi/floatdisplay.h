#pragma once

#include "userinterface.h"

namespace fg {
  class FloatDisplay: public MenuItem {
    std::string name;
    float* value;
    std::string unit;
    float precision;
    std::function<void(void)> callback;

  public:
    FloatDisplay(std::string name, float* value, std::string unit, float precision, std::function<void(void)> callback = nullptr);
    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };
}