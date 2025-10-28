#pragma once

#include "userinterface.h"

namespace fg {

  class ErrorDisplay: public MenuItem {
    std::vector<std::string> errors;
    unsigned current_error = 0;

  public:
    ErrorDisplay(std::vector<std::string> errors);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}
