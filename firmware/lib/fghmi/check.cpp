#include "check.h"

#include <sstream>
#include <iomanip>
namespace fg {

  CheckDisplay::CheckDisplay(std::function<void(void)> callback) : callback(callback) {}

  void CheckDisplay::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text

    UserInterface::display.setTextSize(1);
    printCentered("CHECK DISPLAY & KNOB", 10);

    std::stringstream value_print;
    for(unsigned i = 0; i < position; i++) {
      value_print << "-";
    }
    value_print << "X";
    for(unsigned i = position; i < 10; i++) {
      value_print << "-";
    }
    printCentered(value_print.str().c_str(), 30);

    value_print.str(std::string());
    value_print << "CLICKS: " << clicks;
    printCentered(value_print.str().c_str(), 40);
    printCentered("hold to continue", 50);

    UserInterface::display.setTextSize(1);
  }

  void CheckDisplay::prev() {
    position = position > 0 ? position - 1 : 0;
  }

  void CheckDisplay::next() {
    position = position < 10 ? position + 1 : 10;
  }
  void CheckDisplay::enter() {
    clicks++;
  }
  void CheckDisplay::hold() {
    if(callback) {
      callback();
    }
  }

}