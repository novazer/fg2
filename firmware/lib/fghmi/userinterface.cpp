#include "fghmi.h"

#include <SPI.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define FONT_HEADER FreeSans9pt7b
#define FONT_VALUE FreeSansBold18pt7b

#include <sstream>
#include <iomanip>



// Declaration for an SSD1306 display connected to I2C (SDA, SCL pins)
// The pins for I2C are defined by the Wire-library.
// On an arduino UNO:       A4(SDA), A5(SCL)
// On an arduino MEGA 2560: 20(SDA), 21(SCL)
// On an arduino LEONARDO:   2(SDA),  3(SCL), ...
#define OLED_RESET     -1 // Reset pin # (or -1 if sharing Arduino reset pin)
#define SCREEN_ADDRESS 0x3C ///< See datasheet for Address; 0x3D for 128x64, 0x3C for 128x32


namespace fg {

  MenuItem::~MenuItem() {}

  Adafruit_SSD1306 UserInterface::display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

  UserInterface::UserInterface() {}

  void UserInterface::init() {
    if(!UserInterface::display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
      Serial.println(F("SSD1306 allocation failed"));
      for(;;); // Don't proceed, loop forever
    }


    UserInterface::display.clearDisplay();
    UserInterface::display.display();
  }

  void UserInterface::loop() {
    UserInterface::display.clearDisplay();

    if(idle_ticks >= MAX_IDLE_TICKS) {
      if(current_action != UiAction::NONE) {
        idle_ticks = 0;
        current_action = UiAction::NONE;
      }
      UserInterface::display.display();
      return;
    }

    if(items.size()) {
      auto active_item = *items.rbegin();
      active_item->draw();

      switch(current_action) {
        case UiAction::NEXT:
          current_action = UiAction::NONE;
          active_item->next();
          idle_ticks = 0;
          break;
        case UiAction::PREV:
          current_action = UiAction::NONE;
          active_item->prev();
          idle_ticks = 0;
          break;
        case UiAction::ENTER:
          current_action = UiAction::NONE;
          active_item->enter();
          idle_ticks = 0;
          break;
        case UiAction::HOLD:
          current_action = UiAction::NONE;
          active_item->hold();
          idle_ticks = 0;
          break;
        case UiAction::NONE:
        default:
          idle_ticks++;
          break;
      }
      current_action = UiAction::NONE;

    }
    UserInterface::display.display();
  }

  void UserInterface::pop() {
    Serial.print("POP ");
    Serial.print(reinterpret_cast<uint32_t>(this));
    if(items.size()) {
      delete_items.push_back(*items.rbegin());
      items.pop_back();
    }
    Serial.print(" COUNT:");
    Serial.println(items.size());
  }

  void UserInterface::cleanup() {
    for(auto ptr : delete_items) {
      delete ptr;
    }
    delete_items.clear();
  }

  void printCentered(const char* text, uint8_t y) {
    int16_t  x1, y1;
    uint16_t w, h;

    UserInterface::display.getTextBounds(text, 0, y, &x1, &y1, &w, &h);
    UserInterface::display.setCursor((SCREEN_WIDTH - w) / 2, y1);
    UserInterface::display.write(text);
  }

}