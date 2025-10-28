#pragma once

#include "userinterface.h"

namespace fg {
  class HeaterCheck: public MenuItem {
    float* temp1;
    float* temp2;
    float* temp3;
    float* temp4;

    std::function<void(void)> callback;

  public:
    HeaterCheck(float* temp1, float* temp2, float* temp3, float* temp4, std::function<void(void)> callback = nullptr);
    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };
}