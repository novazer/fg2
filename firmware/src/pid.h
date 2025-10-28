#pragma once

#include "oned.h"

namespace fg {

  template<int size>
  class Avg {
    float samples[size];
    unsigned position = 0;
    unsigned filled = 0;
  public:
    void push(float value) {
      samples[position++] = value;
      position = position == size ? 0 : position;
      filled = filled < size ? filled + 1 : filled;
    }

    float avg() {
      float sum = 0;
      for(unsigned i = 0; i < filled; i++) {
        sum += samples[i];
      }
      if(filled) {
        sum /= (float)filled;
        return sum;
      }
      else {
        return 0.0;
      }
    }

    void clear() {
      position = 0;
      filled = 0;
    }
  };

  class Pid {
    static constexpr const size_t D_SMOOTHING = 10;
    const double fp;
    const double fi;
    const double fd;

    double previous;

    double p = 0;
    double i = 0;
    double d = 0;

    Avg<D_SMOOTHING> current_smooth;
    size_t d_wait = D_SMOOTHING;

  public:
    Pid(double fp = 1.0, double fi = 0.0, double fd = 0.0) : fp(fp), fi(fi), fd(fd) {}
    double tick(double current, double target) {
      auto error = target - current;
      p = fp * error;

      // double iupper = clamp(0, 1, 1.0 - p);
      // double ilower = clamp(-1, 0, -1.0 - p);
      i += fi * error;
      // i = clamp(ilower, iupper, i);
      i = clamp(-1, 1, i);

      current_smooth.push(current);
      auto smooth_error = target - current_smooth.avg();

      d = fd * (smooth_error - previous);
      previous = smooth_error;

      if(d_wait) {
        d = 0;
        d_wait--;
      }

      return clamp(0, 1, p + i + d);
    }

    double getP() { return p; }
    double getI() { return i; }
    double getD() { return d; }
  };

}