#pragma once

#include "userinterface.h"

namespace fg {

  class CheckDisplay: public MenuItem {
    std::function<void(void)> callback;
    unsigned position = 5;
    unsigned clicks = 0;
  public:
    CheckDisplay(std::function<void(void)> callback = nullptr);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}