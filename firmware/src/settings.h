#pragma once

#include <string>
#include "nvs_flash.h"
#include "esp_err.h"

namespace fg {

  class SettingsManager {
    nvs_handle my_handle;
  public:
    SettingsManager();
    SettingsManager(const char* part, const char* ns, nvs_open_mode mode = NVS_READONLY);
    bool has(const char* key);
    std::string getStr(const char* key);
    uint8_t getU8(const char* key);
    float getFloat(const char* key);
    esp_err_t setStr(const char* key, const char* str);
    esp_err_t setU8(const char* key, uint8_t value);
    esp_err_t setFloat(const char* key, float value);

    void commit();
    esp_err_t erase(const char* key);
    esp_err_t wipe();
  };

  SettingsManager& settings();

}