#include "update.h"

#include <sstream>
#include <iomanip>
namespace fg {

  UpdateDisplay::UpdateDisplay() {}

  void UpdateDisplay::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text

    UserInterface::display.setTextSize(1);
    printCentered("updating...", 10);

    // display.setFont(&FONT_VALUE);
    UserInterface::display.setTextSize(2);

    std::stringstream value_print;
    value_print << (int)percent << "%\r\n";

    printCentered(value_print.str().c_str(), 30);

    UserInterface::display.setTextSize(1);
  }

  void UpdateDisplay::prev() {}
  void UpdateDisplay::next() {}
  void UpdateDisplay::enter() {}
  void UpdateDisplay::hold() {}

}