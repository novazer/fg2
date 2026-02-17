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
    float* out_co2;
    bool* day;
	uint8_t* sensor_type; //plug

    std::function<void(void)> callback = nullptr;
	
	
	static constexpr uint8_t SENSOR_TYPE_NONE = 0;
    static constexpr uint8_t SENSOR_TYPE_SHT = 1;
    static constexpr uint8_t SENSOR_TYPE_SCD = 2;

  public:
    Dashboard(float* temperature, float* humidity, float* co2, float* out_heater, float* out_dehumidifier, float* out_light, float* out_co2, bool* day, uint8_t* sensor_type);

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