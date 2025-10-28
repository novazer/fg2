#include "submenu.h"

namespace fg {

  SubMenu::SubMenu(std::string name)
    : name(name) {}


  void SubMenu::drawMenu() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);
    std::string display_name = "< " + name + " >";
    printCentered(display_name.c_str(), 10);

    UserInterface::display.setTextSize(2);
    printCentered("...", 30);
  }

  void SubMenu::drawBack() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);
    std::string display_name = "< back >";
    printCentered(display_name.c_str(), 10);

    UserInterface::display.setTextSize(2);
    printCentered("...", 30);
  }

  void SubMenu::draw() {
    if(editing) {
      if(index < items.size()) {
        items[index]->draw();
        if(items[index]->changed) {
          changed = true;
          items[index]->changed = false;
        }
      }
      else {
        drawBack();
      }
    }
    else {
      drawMenu();
    }
  }

  void SubMenu::prev() {
    if(index < items.size() && items[index]->editing) {
      items[index]->prev();
    }
    else {
      auto next = index;
      while(next > 0) {
        next--;
        if(next < items.size() && items[next]->visible) {
          index = next;
          break;
        }
      }
    }
  }

  void SubMenu::next() {
    if(index < items.size() && items[index]->editing) {
      items[index]->next();
    }
    else {
      while(index < items.size()) {
        index++;
        if(index < items.size() && items[index]->visible) {
          break;
        }
      }
    }
  }

  void SubMenu::enter() {
    if(!editing) {
      editing = true;
      index = 0;
    }
    else {
      if(index < items.size()) {
        items[index]->enter();
      }
      else {
        editing = false;
      }
    }
  }

  void SubMenu::hold() {}

}