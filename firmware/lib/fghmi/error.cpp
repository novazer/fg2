#include "error.h"
#include <sstream>

namespace fg {

  ErrorDisplay::ErrorDisplay(std::vector<std::string> errors)
    : errors(errors) {}


  void ErrorDisplay::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text

    UserInterface::display.setTextSize(1);
    std::stringstream value_print;
    value_print << "ERROR " << current_error + 1 << "/" << errors.size();
    printCentered(value_print.str().c_str(), 10);

    // display.setFont(&FONT_VALUE);
    UserInterface::display.setTextSize(1);
    printCentered(errors[current_error].c_str(), 30);

    UserInterface::display.setTextSize(1);
  }

  void ErrorDisplay::prev() {
    current_error = current_error > 0 ? current_error - 1 : errors.size() - 1;
  }
  void ErrorDisplay::next() {
    current_error = current_error < errors.size() - 1 ? current_error + 1 : 0;
  }
  void ErrorDisplay::enter() {}
  void ErrorDisplay::hold() {}

}
