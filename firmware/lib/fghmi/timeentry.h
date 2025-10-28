#pragma once

#include "userinterface.h"

namespace fg {

  class TimeEntry: public MenuItem {
    bool active = false;
    int hours = 0;
    int minutes = 0;
    unsigned int stage = 0;
    std::string name;
    std::function<void(std::uint32_t)> callback;
  public:
    TimeEntry(std::string name, uint32_t value, std::function<void(std::uint32_t)> callback);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}