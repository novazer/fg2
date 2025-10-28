#include "dashboard.h"
#include "icons.h"

#include <sstream>
#include <iomanip>
#include <wifi.h>


namespace fg {
  Dashboard::Dashboard(float* temperature, float* humidity, float* co2, float* out_heater, float* out_dehumidifier, float* out_light, float* out_co2, bool* day) :
    temperature(temperature), humidity(humidity), co2(co2), out_heater(out_heater), out_dehumidifier(out_dehumidifier), out_light(out_light), out_co2(out_co2), day(day) {}


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

    value_print.str(std::string());
    UserInterface::display.drawBitmap(1, 21, ICON_HUMIDITY, 16, 16, SSD1306_WHITE);
    value_print << std::fixed << std::setprecision(0) << *co2 << "ppm";
    UserInterface::display.setCursor(18, 25);
    UserInterface::display.write(value_print.str().c_str());

    // value_print.str(std::string());
    // UserInterface::display.drawBitmap(1, 48, ICON_FAN, 16, 16, SSD1306_WHITE);
    // UserInterface::display.setCursor(18, 52);
    // value_print << std::fixed << std::setprecision(0) << *out_heater << "%";
    // UserInterface::display.write(value_print.str().c_str());

    // value_print.str(std::string());
    // UserInterface::display.drawBitmap(65, 48, ICON_FAN, 16, 16, SSD1306_WHITE);
    // UserInterface::display.setCursor(83, 75);
    // value_print << std::fixed << std::setprecision(0) << *out_dehumidifier << "%";
    // UserInterface::display.write(value_print.str().c_str());

    // value_print.str(std::string());
    // UserInterface::display.drawBitmap(1, 48, ICON_FAN, 16, 16, SSD1306_WHITE);
    // UserInterface::display.setCursor(18, 100);
    // value_print << std::fixed << std::setprecision(0) << *out_light << "%";
    // UserInterface::display.write(value_print.str().c_str());

    // value_print.str(std::string());
    // UserInterface::display.drawBitmap(1, 48, ICON_FAN, 16, 16, SSD1306_WHITE);
    // UserInterface::display.setCursor(50, 52);
    // value_print << std::fixed << std::setprecision(0) << *out_co2 << "%";
    // UserInterface::display.write(value_print.str().c_str());

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


    if(*day) {
      UserInterface::display.drawBitmap(110, 21, ICON_DAY, 16, 16, SSD1306_WHITE);
    }
    else {
      UserInterface::display.drawBitmap(110, 21, ICON_NIGHT, 16, 16, SSD1306_WHITE);
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