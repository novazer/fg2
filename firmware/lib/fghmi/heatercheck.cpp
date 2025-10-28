#include "heatercheck.h"

#include <sstream>
#include <iomanip>
namespace fg {

HeaterCheck::HeaterCheck(float* temp1, float* temp2, float* temp3, float* temp4, std::function<void(void)> callback)
    : temp1(temp1), temp2(temp2), temp3(temp3), temp4(temp4), callback(callback) {}


  void HeaterCheck::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);
    std::string display_name = "CHECKING HEATER";
    printCentered(display_name.c_str(), 10);

    // display.setFont(&FONT_VALUE);
    UserInterface::display.setTextSize(1);
    std::stringstream value_print;
    value_print << std::fixed << std::setprecision(1) << *temp1 << "C " << *temp2 << "C";
    printCentered(value_print.str().c_str(), 30);

    value_print.str(std::string());
    value_print << std::fixed << std::setprecision(1) << *temp3 << "C " << *temp4 << "C";
    printCentered(value_print.str().c_str(), 40);
  }

  void HeaterCheck::prev() {}
  void HeaterCheck::next() {}
  void HeaterCheck::enter() {
    if(callback) {
      callback();
    }
  }
  void HeaterCheck::hold() {}

}