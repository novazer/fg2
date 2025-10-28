#include "settings.h"
#include "Arduino.h"


#include "nvs_flash.h"
#include "nvs.h"

#define NVS_PART "nvs"
#define SETTINGS_NS "settings"

namespace fg {

  SettingsManager::SettingsManager(const char* part, const char* ns, nvs_open_mode mode) {
    // Initialize NVS
    esp_err_t err = nvs_flash_init_partition(part);
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        // NVS partition was truncated and needs to be erased
        // Retry nvs_flash_init
        ESP_ERROR_CHECK(nvs_flash_erase_partition(part));
        err = nvs_flash_init_partition(part);
    }
    ESP_ERROR_CHECK( err );

    err = nvs_open_from_partition(part, ns, mode, &my_handle);
    ESP_ERROR_CHECK( err );
  }

  SettingsManager::SettingsManager() {
    // Initialize NVS
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        // NVS partition was truncated and needs to be erased
        // Retry nvs_flash_init
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK( err );

    err = nvs_open("settings", NVS_READWRITE, &my_handle);
    ESP_ERROR_CHECK( err );
  }

  bool SettingsManager::has(const char* key) {
    size_t required_size;
    auto err = nvs_get_str(my_handle, key, nullptr, &required_size);
    assert(err == ESP_OK || err == ESP_ERR_NVS_NOT_FOUND);
    if(err) {
      return false;
    }
    else {
      return true;
    }
  }

  uint8_t SettingsManager::getU8(const char* key) {
    uint8_t value;
    auto err = nvs_get_u8(my_handle, key, &value);
    assert(err == ESP_OK || err == ESP_ERR_NVS_NOT_FOUND);
    if(err) {
      return 0;
    }
    else {
      return value;
    }
  }

  float SettingsManager::getFloat(const char* key) {
    uint32_t dummy;
    auto err = nvs_get_u32(my_handle, key, &dummy);
    assert(err == ESP_OK || err == ESP_ERR_NVS_NOT_FOUND);
    if(err) {
      return 0;
    }
    else {
      float value;
      memcpy(&value, &dummy, sizeof(float));
      return value;
    }
  }


  std::string SettingsManager::getStr(const char* key) {
    size_t required_size;
    auto err = nvs_get_str(my_handle, key, nullptr, &required_size);
    assert(err == ESP_OK || err == ESP_ERR_NVS_NOT_FOUND);
    if(err) {
      return "";
    }
    else {
      std::string value;
      value.resize(required_size);
      nvs_get_str(my_handle, key, const_cast<char*>(value.c_str()), &required_size);
      return value;
    }
  }

  esp_err_t SettingsManager::setStr(const char* key, const char* value) {
    auto err = nvs_set_str(my_handle, key, value);
    ESP_ERROR_CHECK( err );
    return err;
  }

  esp_err_t SettingsManager::setU8(const char* key, uint8_t value){
    return nvs_set_u8(my_handle, key, value);
  }

  esp_err_t SettingsManager::setFloat(const char* key, float value){
    uint32_t dummy;
    static_assert(sizeof(dummy) == sizeof(value), "");
    memcpy(&dummy, &value, sizeof(float));
    return nvs_set_u32(my_handle, key, dummy);
  }

  void SettingsManager::commit() {
    nvs_commit(my_handle);
  }

  esp_err_t SettingsManager::erase(const char* key) {
    return nvs_erase_key(my_handle, key);
  }

  esp_err_t SettingsManager::wipe() {
    return nvs_erase_all(my_handle);
  }

  SettingsManager& settings() {
    static SettingsManager instance;
    return instance;
  }

}