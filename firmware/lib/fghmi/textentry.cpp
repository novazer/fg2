#include "textentry.h"

namespace fg {

  TextEntry::TextEntry(std::string name, std::function<void(std::string)> callback) : name(name), callback(callback) {}
  TextEntry::TextEntry(std::string name, std::string value, std::function<void(std::string)> callback) : name(name), value(value), callback(callback) {}

  void TextEntry::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);

    std::string display_name = name;
    printCentered(display_name.c_str(), 10);
    if(state == 0) {
      printCentered("(hold for options)", 20);
    }
    else {
      printCentered("(hold to edit)", 20);
    }


    if(value.size() > 9) {
      UserInterface::display.setTextSize(1);
    }
    else {
      UserInterface::display.setTextSize(2);
    }

    int16_t  x1, y1;
    uint16_t w, h;
    int16_t y_pos = 33;

    std::string display_value, print_value;

    if(value.size() >= 20) {
      display_value = value.substr(0, 20);
      UserInterface::display.getTextBounds(display_value.c_str(), 0, y_pos, &x1, &y1, &w, &h);
      int16_t pos = (SCREEN_WIDTH - w) / 2;
      UserInterface::display.setCursor(pos, y1);
      UserInterface::display.write(display_value.c_str());
      display_value = value.substr(20) + allowed_chars[current_index];
      print_value = value.substr(20);
      y_pos += h + 1;
    }
    else {
      display_value = value + allowed_chars[current_index];
      print_value = value;
    }

    UserInterface::display.getTextBounds(display_value.c_str(), 0, y_pos, &x1, &y1, &w, &h);
    int16_t pos = (SCREEN_WIDTH - w) / 2;
    UserInterface::display.setCursor(pos, y1);
    UserInterface::display.write(print_value.c_str());

    if(state == 0) {
      UserInterface::display.getTextBounds(print_value.c_str(), 0, y_pos, &x1, &y1, &w, &h);
      UserInterface::display.setCursor(pos + w, y1);
      UserInterface::display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
      UserInterface::display.write(allowed_chars[current_index]);
      UserInterface::display.setTextColor(SSD1306_WHITE, SSD1306_BLACK);
    }

    UserInterface::display.setTextSize(1);

    if(state == 1) {
      UserInterface::display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    }
    UserInterface::display.setCursor(10, 55);
    UserInterface::display.write("BACK");
    UserInterface::display.setTextColor(SSD1306_WHITE, SSD1306_BLACK);

    if(state == 2) {
      UserInterface::display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    }
    UserInterface::display.setCursor(90, 55);
    UserInterface::display.write("DONE");
    UserInterface::display.setTextColor(SSD1306_WHITE, SSD1306_BLACK);

  }

  void TextEntry::prev() {
    if(state != 0) {
      state = state == 1 ? 2 : 1;
    }
    else {
      current_index = current_index > 0 ? current_index - 1 : current_index;
      Serial.println(current_index);
    }
  }

  void TextEntry::next() {
    if(state != 0) {
      state = state == 1 ? 2 : 1;
    }
    else {
      current_index = current_index < strlen(allowed_chars) ? current_index + 1 : current_index;
      Serial.println(strlen(allowed_chars));
      Serial.println(current_index);
    }
  }

  void TextEntry::enter() {
    if(state == 0) {
      value.push_back(allowed_chars[current_index]);
    }
    else if(state == 1) {
      if(value.size()) {
        value.pop_back();
      }
    }
    else if(state == 2) {
      state = 0;
      editing = false;
      callback(value);
    }
  }

  void TextEntry::hold() {
    state = state != 0 ? 0 : 1;
  }

}