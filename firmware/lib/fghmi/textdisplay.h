#pragma once

#include "userinterface.h"

namespace fg {

  class TextDisplay: public MenuItem {
    std::string text;
    std::string name;
    uint8_t scale;
    std::function<void(void)> callback;
  public:
    TextDisplay(std::string text, uint8_t scale = 1, std::function<void(void)> callback = nullptr);
    TextDisplay(std::string text, std::string name, uint8_t scale = 1, std::function<void(void)> callback = nullptr);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}