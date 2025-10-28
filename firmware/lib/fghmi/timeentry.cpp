#include "timeentry.h"
#include <cstdio>

namespace fg {

  TimeEntry::TimeEntry(std::string name, uint32_t value, std::function<void(std::uint32_t)> callback) : name(name), callback(callback) {
    hours = value / 3600;
    minutes = (value - 3600 * hours) / 60;
  }

  void TimeEntry::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);

    std::string display_name = name;
    printCentered(display_name.c_str(), 10);

    char display_h[3];
    char display_m[3];
    UserInterface::display.setTextSize(2);
    std::sprintf(display_h, "%02u", hours);
    std::sprintf(display_m, "%02u", minutes);

    if(stage == 0) {
      UserInterface::display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
      UserInterface::display.setCursor(32,30);
      UserInterface::display.write(display_h);

      UserInterface::display.setTextColor(SSD1306_WHITE, SSD1306_BLACK);
      UserInterface::display.setCursor(60,30);
      UserInterface::display.write(":");
      UserInterface::display.setCursor(72,30);
      UserInterface::display.write(display_m);
    }
    else {
      UserInterface::display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
      UserInterface::display.setCursor(72,30);
      UserInterface::display.write(display_m);

      UserInterface::display.setTextColor(SSD1306_WHITE, SSD1306_BLACK);
      UserInterface::display.setCursor(32,30);
      UserInterface::display.write(display_h);
      UserInterface::display.setCursor(60,30);
      UserInterface::display.write(":");
    }

  }

  void TimeEntry::prev() {
    if(stage == 0) {
      hours = hours > 0 ? hours - 1 : 0;
    }
    else {
      minutes = minutes > 0 ? minutes - 1 : 0;
    }
  }

  void TimeEntry::next() {
    if(stage == 0) {
      hours = hours < 23 ? hours + 1 : 23;
    }
    else {
      minutes = minutes < 59 ? minutes + 1 : 59;
    }
  }

  void TimeEntry::enter() {
    if(stage == 0) {
      stage++;
    }
    else {
      callback(hours * 3600 + minutes * 60);
    }
  }

  void TimeEntry::hold() {
    stage = 0;
  }

}