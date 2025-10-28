#include "button.h"

namespace fg {

  Button::Button(std::string name, std::function<void(void)> listener)
    : name(name), listener(listener) {}


  void Button::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);
    std::string display_name = "< " + name + " >";
    printCentered(display_name.c_str(), 10);
  }

  void Button::prev() {}
  void Button::next() {}
  void Button::enter() {
    listener();
  }
  void Button::hold() {}

}
