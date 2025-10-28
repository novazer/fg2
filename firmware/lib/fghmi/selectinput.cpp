#include "selectinput.h"

#include <sstream>
#include <iomanip>
namespace fg {

  SelectInput::SelectInput(std::string name, uint32_t value, std::vector<std::string> options, std::function<void(uint32_t)> listener)
    : name(name), value(value), options(options), listener(listener) {}


  void SelectInput::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);
    printCentered(name.c_str(), 10);

    // display.setFont(&FONT_VALUE);
    UserInterface::display.setTextSize(1);

    std::stringstream value_print;
    value_print << "< " << options[value] << " >";
    printCentered(value_print.str().c_str(), 30);
  }

  void SelectInput::prev() {
    if(value > 0) {
      value -= 1;
      changed = true;
    }
  }

  void SelectInput::next()  {
    if(value < options.size() - 1) {
      value += 1;
      changed = true;
    }
  }

  void SelectInput::enter() {
    listener(value);
  }

  void SelectInput::hold() {

  }

}