#pragma once

#include "Wire.h"

namespace fg {

  struct DaisyPayload {
    float temperture;
    float humidity;
    float co2;
    uint8_t sensor_type;
    uint8_t crc;

    uint8_t calculateCrc() const;
  };

  class DaisySlave {
    TwoWire* daisy_wire;
    float temperature;
    float humidity;
    float co2;
    uint8_t sensor_type;

  public:
    bool init(TwoWire& my_wire);
    bool read();
    inline float getTemperature() const { return temperature; }
    inline float getHumidity() const { return humidity; }
    inline float getCo2() const { return co2; }
    inline uint8_t getSensorType() const { return sensor_type; }
  };


  class DaisyMaster {
    friend class DaisySlave;
    static constexpr int SLAVE_I2C_ADDR = 0x11;
    const float& temperature;
    const float& humidity;
    const float& co2;
    const uint8_t& sensor_type;

  public:
    DaisyMaster(const float& temperature, const float& humidity, const float& co2, const uint8_t& sensor_type);
    void init(int sdaPin, int sclPin, uint32_t frequency);
    void send();
  };


}