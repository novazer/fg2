#pragma once

#include "userinterface.h"

namespace fg {

  class Dashboard: public MenuItem {
    float* temperature;
    float* humidity;
    float* co2;
    float* out;
    uint8_t* sensor_type;
    bool* day;
    bool* use_day;

    std::function<void(void)> callback = nullptr;


    static constexpr uint8_t SENSOR_TYPE_NONE = 0;
    static constexpr uint8_t SENSOR_TYPE_SHT = 1;
    static constexpr uint8_t SENSOR_TYPE_SCD = 2;
    static constexpr uint8_t SENSOR_TYPE_SLAVE = 3;

  public:
    Dashboard(float* temperature, float* humidity, float* co2, float* out, uint8_t* sensor_type, bool* day, bool* use_day);

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