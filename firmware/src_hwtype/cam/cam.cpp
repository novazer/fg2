#include "cam.h"
#include "wifi.h"

#include "time.h"
#include "esp_sntp.h"


namespace fg {

  std::unique_ptr<AutomationController> createController(Fridgecloud& cloud) {
    return std::unique_ptr<AutomationController>(new CameraController(cloud));
  }

  CameraController::CameraController(Fridgecloud& cloud) :
    cloud(cloud)
  {

  }

  template<class T> inline void loadIfAvaliable(T& val, DynamicJsonDocument doc) {
    if(!doc.isNull()) {
      val = doc.as<T>();
    }
    else {
      Serial.println("error loading settings field");
    }
  }

  template<> inline void loadIfAvaliable(String& val, DynamicJsonDocument doc) {
    if(!doc.isNull()) {
      val = doc.as<const char*>();
    }
    else {
      Serial.println("error loading settings field");
    }
  }

  void CameraController::loadSettings(const String& settings_json) {
  }

  void CameraController::init() {
    auto saved_settings = fg::settings().getStr("config");
    loadSettings(saved_settings.c_str());

    cloud.onConfig([&](const String & payload) {
      Serial.println("received new configuration");
      loadSettings(payload);

      fg::settings().setStr("config", payload.c_str());
      fg::settings().commit();

      loop();

    });

    cloud.onCommand([&](const JsonDocument& command) {

    });
  }

  void CameraController::fastloop() {
  }

  void CameraController::loop() {

  }

  void CameraController::initSettingsMenu(UserInterface* ui) {
  }

  void CameraController::initStatusMenu(UserInterface* ui) {
  }

}
