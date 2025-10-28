#include <memory>
#include "daisychain.h"
#include "Arduino.h"

fg::DaisyMaster* master = nullptr;

void onRequest() {
  master->send();
}

void onReceive(int len) {
  Wire1.flush();
}

namespace fg {

  uint8_t DaisyPayload::calculateCrc() const {
    const uint8_t* ptr = (const uint8_t*)this;
    uint8_t crc = 0;
    for(auto i = 0; i < sizeof(DaisyPayload); i++) {
      crc = crc ^ ptr[i];
    }
    return crc;
  }

  DaisyMaster::DaisyMaster(const float& temperature, const float& humidity, const float& co2, const uint8_t& sensor_type) :
    temperature(temperature), humidity(humidity), co2(co2), sensor_type(sensor_type)
  {
    if(!master) {
      master = this;
    }
  }

  void DaisyMaster::init(int sdaPin, int sclPin, uint32_t frequency) {
    Serial.println("SLAVE I2C INIT NOW!");
    Wire1.onReceive(onReceive);
    Wire1.onRequest(onRequest);
    if(Wire1.begin(SLAVE_I2C_ADDR, sdaPin, sclPin, frequency)) {
      Serial.println("SLAVE I2C INIT SUCCESS");
    }
    else {
      Serial.println("SLAVE I2C INIT FAILED!!!");
    }

    Serial.println("SLAVE I2C INIT END");
  }

  void DaisyMaster::send() {
    DaisyPayload payload;
    payload.temperture = temperature;
    payload.humidity = humidity;
    payload.co2 = co2;
    payload.sensor_type = sensor_type;
    payload.crc = payload.calculateCrc();

    Wire1.write((const uint8_t*)&payload, sizeof(DaisyPayload));
  }

  bool DaisySlave::init(TwoWire& my_wire) {
    daisy_wire = &my_wire;
    return true;
  }

  bool DaisySlave::read() {
    Wire.flush();
    Wire.setTimeOut(10);
    Wire.setTimeout(10);
    auto time = xTaskGetTickCount();
    Wire.beginTransmission(DaisyMaster::SLAVE_I2C_ADDR);
    if (Wire.endTransmission() == 0) {
      uint8_t bytesReceived = Wire.requestFrom(DaisyMaster::SLAVE_I2C_ADDR, sizeof(DaisyPayload));
      DaisyPayload payload;
      auto delay = xTaskGetTickCount() - time;
      Serial.print("DELAY: ");
      Serial.println(delay);

      if (bytesReceived == sizeof(DaisyPayload)) {  //If received more than zero bytes
        Wire.readBytes((uint8_t*)&payload, bytesReceived);

        if(payload.calculateCrc() != 0xff) {
          Serial.println("CHECKSUM FAILED!!");
          return false;
        }

        temperature = payload.temperture;
        humidity = payload.humidity;
        co2 = payload.co2;
        sensor_type = payload.sensor_type;

        return true;
      }
    }
    return false;
  }

}