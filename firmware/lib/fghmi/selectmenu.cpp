#include "selectmenu.h"
#include "icons.h"

namespace fg {

  SelectMenu::SelectMenu() {}

  void SelectMenu::addOption(std::string name, std::function<void(void)> cb) {
    options.push_back({name, cb, nullptr});
  }

  void SelectMenu::addOption(std::string name, icon_t icon, std::function<void(void)> cb) {
    options.push_back({name, cb, icon});
  }

  void SelectMenu::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);

    if(selected > 0) {
      if(options[selected - 1].icon) {
        UserInterface::display.drawBitmap(0, 3, options[selected - 1].icon, 16, 16, SSD1306_WHITE);
      }
      UserInterface::display.setCursor(20, 7);
      UserInterface::display.write(options[selected - 1].name.c_str());
    }

    UserInterface::display.fillRect(0, 22, 128, 21, SSD1306_WHITE);
    if(options[selected].icon) {
      UserInterface::display.drawBitmap(1, 24, options[selected].icon, 16, 16, SSD1306_BLACK);
    }

    UserInterface::display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
    UserInterface::display.setCursor(20, 28);
    UserInterface::display.write((options[selected].name).c_str());
    UserInterface::display.setTextColor(SSD1306_WHITE, SSD1306_BLACK);

    if(selected < options.size() - 1) {
      if(options[selected + 1].icon) {
        UserInterface::display.drawBitmap(1, 48, options[selected + 1].icon, 16, 16, SSD1306_WHITE);
      }
      UserInterface::display.setCursor(20, 52);
      UserInterface::display.write(options[selected + 1].name.c_str());
    }
  }

  void SelectMenu::prev() {
    selected = selected > 0 ? selected - 1 : 0;
  }

  void SelectMenu::next() {
    selected = selected < options.size() - 1 ? selected + 1 : selected;
  }

  void SelectMenu::enter() {
    options[selected].callback();
  }

  void SelectMenu::hold() {}

}