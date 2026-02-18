#pragma once

#include "userinterface.h"

namespace fg {

  class Dashboard: public MenuItem {
    float* temperature;
    float* humidity;
    float* co2;
    float* out_heater;
    float* out_dehumidifier;
    float* out_light;
    uint32_t* out_co2;
    bool* day;

    std::function<void(void)> callback = nullptr;

  public:
    Dashboard(float* temperature, float* humidity, float* co2, float* out_heater, float* out_dehumidifier, float* out_light, uint32_t* out_co2, bool* day);

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