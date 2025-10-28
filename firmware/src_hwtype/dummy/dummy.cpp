#include "dummy.h"

namespace fg {

  std::unique_ptr<AutomationController> createController(Fridgecloud& cloud) {
    return std::unique_ptr<AutomationController>(new DummyController(cloud));
  }

  DummyController::DummyController(Fridgecloud& cloud) :cloud(cloud) {

  }

  void DummyController::loop() {
    DynamicJsonDocument status(1024);
    cloud.updateStatus(status);
  }

  void DummyController::init() {
    cloud.onConfig([&](const JsonDocument& new_settings) {
      loop();
    });

    cloud.onCommand([&](const JsonDocument& command) {
      if(command["action"] && command["action"] == std::string("test")) {
        testmode_duration = TESTMODE_MAX_DURATION;
      }
      else if(command["action"] && command["action"] == std::string("stoptest")) {
        testmode_duration = 0;
      }
    });
  }

}