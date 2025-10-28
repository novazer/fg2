#pragma once

#include "userinterface.h"

namespace fg {

  class Button: public MenuItem {
    std::string name;
    std::function<void(void)> listener;
  public:
    Button(std::string name, std::function<void(void)> listener);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}
