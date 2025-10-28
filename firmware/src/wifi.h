#pragma once

#include "fghmi.h"
#include "fridgecloud.h"

namespace fg {
  class WifiApDash: public MenuItem {
    std::string ssid;
    std::string ip;

    std::function<void(void)> callback = nullptr;

  public:
    WifiApDash(std::string ssid, std::string ip, std::function<void(void)> callback);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

  class WifiStaDash: public MenuItem {
    std::string ssid;
    std::string password;
    std::string ip;
    float rssi;

    std::function<void(void)> callback = nullptr;

  public:
    WifiStaDash(std::string ssid, std::string ip, float rssi, std::function<void(void)> callback);

    void draw() override;
    void prev() override;
    void next() override;
    void enter() override;
    void hold() override;
  };

}

bool initializeWifi();
void resetCredentials();
void wifiTick();
bool wifiIsConnected();
void showWifiUi(fg::UserInterface* ui, fg::Fridgecloud* cloud);