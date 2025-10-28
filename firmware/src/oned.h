#pragma once

namespace fg {

  double clamp(double min, double max, double value) {
    return value < min ? min : value > max ? max : value;
  }

  double linstep(double min, double max, double value) {
    return clamp(0, 1, (value - min) / (max - min));
  }

}