#pragma once

#include "userinterface.h"

namespace fg {

  class UpdateDisplay: public MenuItem {
    uint8_t percent = 0;
  public:
    UpdateDisplay();

    inline void setPercent(uint8_t percent) {
      this->percent = percent;
    }

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}