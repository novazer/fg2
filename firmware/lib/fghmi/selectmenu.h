#pragma once

#include "userinterface.h"
#include "icons.h"
namespace fg {

  struct SelectMenuOption {
    std::string name;
    std::function<void(void)> callback;
    icon_t icon;
  };

  class SelectMenu: public MenuItem {
    std::vector<SelectMenuOption> options;
    std::function<void(unsigned int)> listener;
    unsigned int selected = 0;
  public:
    SelectMenu();
    void addOption(std::string name, std::function<void(void)> cb);
    void addOption(std::string name, icon_t icon, std::function<void(void)> cb);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}