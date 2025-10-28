
#pragma once

#include "userinterface.h"

namespace fg {

  class SubMenu: public MenuItem {
    std::string name;

    std::vector<MenuItem*> items;
    unsigned index;

    void drawMenu();
    void drawBack();

  public:
    SubMenu(std::string name);
    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;

    template<class T, class... Args>
    T* addItem(Args... args) {
      auto item = new T(args...);
      items.push_back(item);
      return item;
    }
  };

}