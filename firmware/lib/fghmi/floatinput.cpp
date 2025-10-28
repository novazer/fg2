#include "floatinput.h"

#include <sstream>
#include <iomanip>
namespace fg {

  FloatInput::FloatInput(std::string name, float value, std::string unit, float min, float max, float step, float precision, std::function<void(float)> listener)
    : name(name), value(value), unit(unit), min(min), max(max), step(step), precision(precision), listener(listener) {}

  void FloatInput::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);
    printCentered(name.c_str(), 10);

    // display.setFont(&FONT_VALUE);
    UserInterface::display.setTextSize(2);
    std::stringstream value_print;
    value_print << "< " << std::fixed << std::setprecision(precision) << value << unit << " >";

    printCentered(value_print.str().c_str(), 30);
  }

  void FloatInput::prev() {
    value -= step;
    if(value < min) {
      value = min;
    }
    changed = true;
  }

  void FloatInput::next()  {
    value += step;
    if(value > max) {
      value = max;
    }
    changed = true;
  }

  void FloatInput::enter() {
    listener(value);
  }

  void FloatInput::hold() {}

}