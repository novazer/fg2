#include "floatdisplay.h"

#include <sstream>
#include <iomanip>
namespace fg {

FloatDisplay::FloatDisplay(std::string name, float* value, std::string unit, float precision, std::function<void(void)> callback)
    : name(name), value(value), unit(unit), precision(precision), callback(callback) {}


  void FloatDisplay::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);
    std::string display_name = "< " + name + " >";
    printCentered(display_name.c_str(), 10);

    // display.setFont(&FONT_VALUE);
    UserInterface::display.setTextSize(2);
    std::stringstream value_print;
    value_print << std::fixed << std::setprecision(precision) << *value << unit;
    printCentered(value_print.str().c_str(), 30);
  }

  void FloatDisplay::prev() {}
  void FloatDisplay::next() {}
  void FloatDisplay::enter() {
    if(callback) {
      callback();
    }
  }
  void FloatDisplay::hold() {}

}