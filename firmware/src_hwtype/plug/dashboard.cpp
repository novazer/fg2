#include "dashboard.h"
#include "icons.h"

#include <sstream>
#include <iomanip>
#include <wifi.h>


namespace fg {
  Dashboard::Dashboard(float* temperature, float* humidity, float* co2, float* out, uint8_t* sensor_type, bool* day, bool* use_day) :
    temperature(temperature), humidity(humidity), co2(co2), out(out), sensor_type(sensor_type), day(day), use_day(use_day) {}


  void Dashboard::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);
    // std::string temp_display = "T: " + name + " >";
    // printCentered(display_name.c_str(), 10);

    //     int16_t  x1, y1;
    // uint16_t w, h;

    // UserInterface::display.getTextBounds(text, 0, y, &x1, &y1, &w, &h);
    //

    // // display.setFont(&FONT_VALUE);
    // UserInterface::display.setTextSize(scale);


    //UserInterface::display.drawBitmap(35, 1, ICON_SETTINGS, 16, 16, SSD1306_WHITE);

    //

    if(*sensor_type == SENSOR_TYPE_NONE) {
      UserInterface::display.setCursor(18, 4);
      UserInterface::display.write("NO SENSOR");
    }
    else {
      std::stringstream value_print;
      UserInterface::display.drawBitmap(1, 1, ICON_TEMPERATURE, 16, 16, SSD1306_WHITE);
      value_print << std::fixed << std::setprecision(1) << *temperature << "C";
      UserInterface::display.setCursor(18, 4);
      UserInterface::display.write(value_print.str().c_str());

      value_print.str(std::string());
      UserInterface::display.drawBitmap(60, 1, ICON_HUMIDITY, 16, 16, SSD1306_WHITE);
      value_print << std::fixed << std::setprecision(1) << *humidity << "%";
      UserInterface::display.setCursor(78, 4);
      UserInterface::display.write(value_print.str().c_str());

      if(*co2 != 0) {
        value_print.str(std::string());
        UserInterface::display.drawBitmap(1, 21, ICON_HUMIDITY, 16, 16, SSD1306_WHITE);
        value_print << std::fixed << std::setprecision(0) << *co2 << "ppm";
        UserInterface::display.setCursor(18, 25);
        UserInterface::display.write(value_print.str().c_str());
      }
    }

    auto rssi = WiFi.RSSI();

    if(rssi == 0) {
      UserInterface::display.drawBitmap(110, 1, ICON_WIFI_NONE, 16, 16, SSD1306_WHITE);
    }
    else if(rssi > -60) {
      UserInterface::display.drawBitmap(110, 1, ICON_WIFI_FULL, 16, 16, SSD1306_WHITE);
    }
    else if (rssi > -80) {
      UserInterface::display.drawBitmap(110, 1, ICON_WIFI_MED, 16, 16, SSD1306_WHITE);
    }
    else {
      UserInterface::display.drawBitmap(110, 1, ICON_WIFI_LOW, 16, 16, SSD1306_WHITE);
    }

    UserInterface::display.setCursor(50, 40);
    UserInterface::display.setTextSize(2);
    if(*out > 0.5) {
      UserInterface::display.write("ON");
    }
    else {
      UserInterface::display.write("OFF");
    }

    if(*use_day) {
      if(*day) {
        UserInterface::display.drawBitmap(110, 21, ICON_DAY, 16, 16, SSD1306_WHITE);
      }
      else {
        UserInterface::display.drawBitmap(110, 21, ICON_NIGHT, 16, 16, SSD1306_WHITE);
      }
    }
  }

  void Dashboard::prev() {}
  void Dashboard::next() {}
  void Dashboard::enter() {
    if(callback) {
      callback();
    }
  }
  void Dashboard::hold() {}

}