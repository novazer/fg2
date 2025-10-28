#pragma once

#include "fridgecloud.h"
#include "fghmi.h"
#include <memory>

namespace fg {

  class AutomationController {
  public:
    virtual void init() = 0;
    virtual void loop() = 0;
    virtual void fastloop() = 0;
    virtual void initStatusMenu(UserInterface* ui) = 0;
    virtual void initSettingsMenu(UserInterface* ui) = 0;
  };

  std::unique_ptr<AutomationController> createController(Fridgecloud& cloud);


  class TestingController {
  public:
    virtual void init() = 0;
    virtual void loop() = 0;
    virtual void fastloop() = 0;
  };

  std::unique_ptr<TestingController> createTestingController(UserInterface* ui);

}