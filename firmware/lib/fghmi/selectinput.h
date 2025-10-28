#pragma once

#include "userinterface.h"

namespace fg {

  class SelectInput: public MenuItem {
    std::string name;
    uint32_t value;
    std::vector<std::string> options;
    std::function<void(uint32_t)> listener;

  public:
    SelectInput(std::string name, uint32_t value, std::vector<std::string> options, std::function<void(uint32_t)> listener);
    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}