#pragma once

#include "userinterface.h"

namespace fg {

  class Dashboard: public MenuItem {
    float* temperature;
    float* humidity;
    float* speed;
    float* rpm;
    bool* day;

    std::function<void(void)> callback = nullptr;

  public:
    Dashboard(float* temperature, float* humidity, float* speed, float* rpm, bool* day);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;

    template<class T>
    void onEnter(T&& cb) {
      callback = cb;
    }
  };

}