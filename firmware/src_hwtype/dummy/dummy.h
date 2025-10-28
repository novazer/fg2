#pragma once

#include "automation.h"

namespace fg {

  class DummyController  : public AutomationController {
    static constexpr unsigned int TESTMODE_MAX_DURATION = 10; // times 10sec

    struct {
      struct {
        uint32_t day = 21600;
        uint32_t night = 79200;
      } daynight;

    } settings;

    struct {
      bool is_day;
      uint32_t timeofday;
    } state;

    unsigned int testmode_duration = 0;
    Fridgecloud& cloud;
  public:
    DummyController(Fridgecloud& cloud);
    void init() override;
    void loop() override;
  };

}