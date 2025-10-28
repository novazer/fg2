#pragma once

#include "fridgecloud.h"
#include "output.h"
#include "automation.h"

#include "fghmi.h"
#include "pid.h"


namespace fg {

  struct CameraControllerSettings {

    void print() const;

  };


  class CameraController : public AutomationController {

    Fridgecloud& cloud;
    CameraControllerSettings settings;

  public:
    CameraController(Fridgecloud& cloud);
    void init() override;
    void loop() override;
    void fastloop() override;
    void initStatusMenu(UserInterface* ui) override;
    void initSettingsMenu(UserInterface* ui) override;
    void loadSettings(const String& settings);

  };

}
