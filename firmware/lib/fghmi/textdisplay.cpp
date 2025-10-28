#include "textdisplay.h"

#include <sstream>
#include <iomanip>
namespace fg {

  TextDisplay::TextDisplay(std::string text, uint8_t scale, std::function<void(void)> callback)
    : text(text), name(""), scale(scale), callback(callback) {}

  TextDisplay::TextDisplay(std::string text, std::string name, uint8_t scale, std::function<void(void)> callback)
    : text(text), name(name), scale(scale), callback(callback) {}


  void TextDisplay::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text

    UserInterface::display.setTextSize(1);
    printCentered(name.c_str(), 10);

    // display.setFont(&FONT_VALUE);
    UserInterface::display.setTextSize(scale);
    printCentered(text.c_str(), 30);

    UserInterface::display.setTextSize(1);
  }

  void TextDisplay::prev() {}
  void TextDisplay::next() {}
  void TextDisplay::enter() {
    if(callback) {
      callback();
    }
  }
  void TextDisplay::hold() {}

}