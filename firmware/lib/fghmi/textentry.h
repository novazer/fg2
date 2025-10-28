#pragma once

#include "userinterface.h"

namespace fg {

  class TextEntry: public MenuItem {
    static constexpr const char* allowed_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#%&'()*,-./:;<>=@[]^_";

    bool active = false;
    unsigned int current_index = 0;
    unsigned int state = 0;
    std::string name;
    std::string value;
    std::function<void(std::string)> callback;
  public:
    TextEntry(std::string name, std::function<void(std::string)> callback);
    TextEntry(std::string name, std::string value, std::function<void(std::string)> callback);
    TextEntry(std::string name, std::string value, std::string allowed, std::function<void(std::string)> callback);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}