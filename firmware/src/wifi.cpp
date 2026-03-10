#include "wifi.h"

#include "settings.h"
#include <esp_task_wdt.h>

#include <WiFiClient.h>
#include <DNSServerAsync.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include "ESP32HTTPUpdateServer.h"
#include <Update.h>

#include <ArduinoJson.h>
#include <EEPROM.h>
#include <sstream>
#include <cctype>
#include <HTTPClient.h>

#include "fridgecloud.h"

#include "cppcodec/base64_rfc4648.hpp"
#include "html_compressed/index.html.h"

#define WIFI_SCAN_TIMEOUT 30000

static constexpr TickType_t SMART_SOCKET_RESEND_PERIOD = configTICK_RATE_HZ * 60;


namespace fg {
  WifiApDash::WifiApDash(std::string ssid, std::string ip, std::function<void(void)> callback) :
    ssid(ssid), ip(ip), callback(callback) {}


  void WifiApDash::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);

    std::stringstream value_print;
    value_print << "connect to:";
    UserInterface::display.setCursor(1, 1);
    UserInterface::display.write(value_print.str().c_str());

    value_print.str(std::string());
    value_print << "SSID: " << ssid;
    UserInterface::display.setCursor(1, 15);
    UserInterface::display.write(value_print.str().c_str());

    value_print.str(std::string());
    value_print << "IP:   " << ip;
    UserInterface::display.setCursor(1, 25);
    UserInterface::display.write(value_print.str().c_str());
  }

  void WifiApDash::prev() {}
  void WifiApDash::next() {}
  void WifiApDash::enter() {
    callback();
  }
  void WifiApDash::hold() {}

  WifiStaDash::WifiStaDash(std::string ssid, std::string ip, float rssi, std::function<void(void)> callback) :
    ssid(ssid), ip(ip), rssi(rssi), callback(callback) {}


  void WifiStaDash::draw() {
    UserInterface::display.setTextColor(SSD1306_WHITE); // Draw white text
    UserInterface::display.setTextSize(1);

    std::stringstream value_print;
    value_print << "current connection:";
    UserInterface::display.setCursor(1, 1);
    UserInterface::display.write(value_print.str().c_str());

    value_print.str(std::string());
    value_print << "SSID: " << ssid;
    UserInterface::display.setCursor(1, 15);
    UserInterface::display.write(value_print.str().c_str());

    value_print.str(std::string());
    value_print << "RSSI: " << rssi;
    UserInterface::display.setCursor(1, 25);
    UserInterface::display.write(value_print.str().c_str());

    value_print.str(std::string());
    value_print << "IP:   " << ip;
    UserInterface::display.setCursor(1, 35);
    UserInterface::display.write(value_print.str().c_str());
  }

  void WifiStaDash::prev() {}
  void WifiStaDash::next() {}
  void WifiStaDash::enter() {
    callback();
  }
  void WifiStaDash::hold() {}
}



#define GPIO_OUT_W1TS_REG (DR_REG_GPIO_BASE + 0x0008)
#define GPIO_OUT_W1TC_REG (DR_REG_GPIO_BASE + 0x000c)

#define DEFAULT_SSID_PREFIX "PLANT_"
#define DEFAULT_HOSTNAME "plantalytix"

std::string primary_ssid;
std::string primary_password;
std::string secondary_ssid;
std::string secondary_password;

bool loadWifiCredentials();
void saveWifiCredentials();
void InitalizeHTTPServer();
std::vector<std::string> scanWifiNetworks();
bool isHexSegment(const std::string& value, size_t expected_len);
bool isSmartSocketSsid(const std::string& value);
std::vector<std::string> scanSmartSocketSsids();
std::string smartSocketDisplayName(const std::string& ssid);
std::string sanitizeSettingString(const std::string& value);
std::string urlEncode(const std::string& value);
bool httpGet(const std::string& url, std::string* response = nullptr);
bool parseSmartSocketIp(const std::string& body, std::string& socket_ip);
void delayWithWatchdog(uint32_t delay_ms);
bool provisionSmartSocket(const std::string& socket_role, const std::string& home_ssid, const std::string& home_password, std::string& socket_ip, std::string& error_message, const std::function<void(const char*)>& progress_callback);
bool isSocketRoleConnected(const std::string& role);
std::string socketRoleKey(const std::string& role);
const std::vector<std::string>& getSocketRolesList();
std::vector<std::string> getSocketRoleOptions();
boolean createConfigurationAP();
bool connectToWifi(std::string ssid, std::string password);


void handleNotFound();
void handleRoot();
void handleGetScan();
String formatBytes(size_t bytes);
String toStringIp(IPAddress ip);
String GetEncryptionType(byte thisType);
boolean isIp(String str);
void handleConfig();
boolean captivePortal();



// DNS server
const byte DNS_PORT = 53;
DNSServer dnsServer;

// Web server
WebServer server(80);

/* Soft AP network parameters */
IPAddress apIP(172, 20, 0, 1);
IPAddress netMsk(255, 255, 255, 0);

std::string ssid = "";
std::string ip = "";
std::string netmask = "";

unsigned long currentMillis = 0;
unsigned long startMillis;

/** Current WLAN status */
short status = WL_IDLE_STATUS;
bool server_active = false;

bool wifi_configured = false;

struct SmartSocketSyncState {
  bool initialized = false;
  bool last_target = false;
  TickType_t last_send_tick = 0;
};

static SmartSocketOutputStates smart_socket_output_states;
static bool smart_socket_outputs_reported = false;
static SmartSocketSyncState smart_socket_state_dehumidifier;
static SmartSocketSyncState smart_socket_state_heater;
static SmartSocketSyncState smart_socket_state_light;
static SmartSocketSyncState smart_socket_state_secondary_light;
static SmartSocketSyncState smart_socket_state_co2;
static fg::Fridgecloud* smart_socket_cloud_handle = nullptr;

static void syncSmartSocketRole(const char* role, bool target_on, SmartSocketSyncState& role_state);

bool initializeWifi() {
  WiFi.persistent(false);
  WiFi.disconnect();

  //handleRoot();

  WiFi.setHostname(DEFAULT_HOSTNAME); // Set the DHCP hostname assigned to ESP station.

  if (loadWifiCredentials()) // Load WLAN credentials for WiFi Settings
  {
    Serial.println(F("Valid Credentials found."));
    wifi_configured = true;
    WiFi.mode(WIFI_STA);

    Serial.println(primary_ssid.c_str());

    if(connectToWifi(primary_ssid, primary_password)) {
      return true;
    }
  }
  else {
    Serial.println(F("NO Valid Credentials found."));
  }
  return true;
}

void wifiTick() {
  static TickType_t last_conncheck = xTaskGetTickCount();

  if(server_active) {
    try {
      server.handleClient();
    }
    catch(...) {
      Serial.println("EXCEPTION!");
    }
  }

  if(wifi_configured && xTaskGetTickCount() - last_conncheck > 30000) {
    last_conncheck = xTaskGetTickCount();
    if(!wifiIsConnected()) {
      WiFi.mode(WIFI_OFF);
      delay(100);
      WiFi.mode(WIFI_STA);
      connectToWifi(primary_ssid, primary_password);
    }
  }

  if(smart_socket_outputs_reported) {
    syncSmartSocketRole("dehumidifier", smart_socket_output_states.dehumidifier_on, smart_socket_state_dehumidifier);
    syncSmartSocketRole("heater", smart_socket_output_states.heater_on, smart_socket_state_heater);
    syncSmartSocketRole("light", smart_socket_output_states.light_on, smart_socket_state_light);
    syncSmartSocketRole("secondary_light", smart_socket_output_states.secondary_light_on, smart_socket_state_secondary_light);
    syncSmartSocketRole("co2", smart_socket_output_states.co2_on, smart_socket_state_co2);
  }
}

void wifiReportSmartSocketOutputs(const SmartSocketOutputStates& states) {
  smart_socket_output_states = states;
  smart_socket_outputs_reported = true;
}

static void syncSmartSocketRole(const char* role, bool target_on, SmartSocketSyncState& role_state) {
  TickType_t now = xTaskGetTickCount();
  bool state_changed = !role_state.initialized || role_state.last_target != target_on;
  bool periodic_resend = role_state.initialized && (now - role_state.last_send_tick >= SMART_SOCKET_RESEND_PERIOD);

  if(!state_changed && !periodic_resend) {
    return;
  }

  bool ok = sendSmartSocketPower(role, target_on);
  if(!ok && smart_socket_cloud_handle != nullptr) {
    std::string message = std::string("message-smart-socket-cmd-failed:") + role + ":" + (target_on ? "on" : "off");
    smart_socket_cloud_handle->log(message, 1);
  }
  role_state.last_target = target_on;
  role_state.last_send_tick = now;
  role_state.initialized = true;
}

float rssi = 0;

std::string ui_ssid;
std::string ui_password;
fg::UserInterface* ui_handle;
std::vector<std::string> scanned_ssids;
std::vector<std::string> scanned_smart_socket_ssids;
std::string custom_mqtt_server;
std::string custom_mqtt_user;
std::string custom_mqtt_port;
std::string custom_mqtt_pass;
std::string custom_mqtt_id;
uint8_t custom_mqtt_enabled;

bool sendSmartSocketPower(const std::string& role, bool turn_on) {
  const std::string key = socketRoleKey(role);
  const std::string socket_ip = sanitizeSettingString(fg::settings().getStr(key.c_str()));
  if(socket_ip.empty()) {
    return false;
  }

  std::string mqtt_password = sanitizeSettingString(fg::settings().getStr("mqtt_pass"));
  if(mqtt_password.empty()) {
    fg::SettingsManager provisioning(NVS_PART, "fg_provisioning");
    mqtt_password = sanitizeSettingString(provisioning.getStr("mqtt_password"));
  }
  if(mqtt_password.empty()) {
    return false;
  }

  const std::string auth = "user=admin&password=" + urlEncode(mqtt_password) + "&";
  const std::string command = turn_on ? "Power%20On" : "Power%20Off";
  return httpGet("http://" + socket_ip + "/cm?" + auth + "cmnd=" + command);
}

static void showSmartSocketTestSelection(unsigned preselected_index) {
  const std::vector<std::string>& roles = getSocketRolesList();
  std::vector<std::string> assigned_roles;
  assigned_roles.push_back("back");

  for(size_t i = 1; i < roles.size(); ++i) {
    if(isSocketRoleConnected(roles[i])) {
      assigned_roles.push_back(roles[i]);
    }
  }

  if(assigned_roles.size() == 1) {
    ui_handle->push<fg::TextDisplay>("no role assigned", 1, []() {
      ui_handle->pop();
    });
    return;
  }

  if(preselected_index >= assigned_roles.size()) {
    preselected_index = 0;
  }

  ui_handle->push<fg::SelectInput>("test socket", preselected_index, assigned_roles, [assigned_roles](unsigned selected) {
    ui_handle->pop();

    if(selected == 0) {
      return;
    }

    const std::string role = assigned_roles[selected];
    const unsigned role_index_for_return = selected;

    std::vector<std::string> actions = {"back", "turn on", "turn off"};
    ui_handle->push<fg::SelectInput>(role.c_str(), 0, actions, [role, role_index_for_return](unsigned action_selected) {
      ui_handle->pop();

      if(action_selected == 0) {
        showSmartSocketTestSelection(role_index_for_return);
        return;
      }

      const bool turn_on = (action_selected == 1);
      const bool ok = sendSmartSocketPower(role, turn_on);

      ui_handle->push<fg::TextDisplay>(ok ? "command sent" : "command failed", 1, [role_index_for_return]() {
        ui_handle->pop();
        showSmartSocketTestSelection(role_index_for_return);
      });
    });
  });
}

static void runConnectSocketFlow() {
  ui_handle->push<fg::TextDisplay>("scanning...");
  ui_handle->loop();

  scanned_smart_socket_ssids = scanSmartSocketSsids();
  std::vector<std::string> socket_options;
  socket_options.reserve(scanned_smart_socket_ssids.size() + 1);
  socket_options.push_back("back");
  for(const auto& socket_ssid : scanned_smart_socket_ssids) {
    socket_options.push_back(smartSocketDisplayName(socket_ssid));
  }

  ui_handle->pop();

  if(scanned_smart_socket_ssids.empty()) {
    ui_handle->push<fg::TextDisplay>("no smart socket found", 1, []() {
      ui_handle->pop();
    });
    return;
  }

  ui_handle->push<fg::SelectInput>("select socket", 0, socket_options, [=](unsigned selected) {
    ui_handle->pop();

    if(selected == 0) {
      return;
    }

    std::string socket_ssid = scanned_smart_socket_ssids[selected - 1];
    if(!isSmartSocketSsid(socket_ssid)) {
      ui_handle->push<fg::TextDisplay>("invalid socket", 1, []() {
        ui_handle->pop();
      });
      return;
    }

    std::vector<std::string> role_options = getSocketRoleOptions();
    ui_handle->push<fg::SelectInput>("select socket", 0, role_options, [=](unsigned role_selected) {
      ui_handle->pop();

      if(role_selected == 0) {
        return;
      }

      const std::vector<std::string>& roles = getSocketRolesList();
      std::string socket_role = roles[role_selected];

      ui_handle->push<fg::TextDisplay>("connecting...");
      ui_handle->loop();

      const std::string home_ssid = primary_ssid;
      const std::string home_password = primary_password;

      if(connectToWifi(socket_ssid, "")) {
        ui_handle->pop();
        ui_handle->push<fg::TextDisplay>("connected");
        ui_handle->loop();

        std::string socket_ip;
        std::string error_message;
        auto update_status = [](const char* message) {
          ui_handle->pop();
          ui_handle->push<fg::TextDisplay>(message);
          ui_handle->loop();
        };

        bool provisioned = provisionSmartSocket(socket_role, home_ssid, home_password, socket_ip, error_message, update_status);

        ui_handle->pop();
        if(provisioned) {
          ui_handle->push<fg::TextDisplay>("socket ready", 1, [socket_ip]() {
            Serial.print("smart socket ready: ");
            Serial.println(socket_ip.c_str());
            ui_handle->pop();
          });
        }
        else {
          ui_handle->push<fg::TextDisplay>(error_message.c_str(), 1, []() {
            ui_handle->pop();
          });
        }
      }
      else {
        ui_handle->pop();
        ui_handle->push<fg::TextDisplay>("conn failed", 1, []() {
          ui_handle->pop();
        });
      }
    });
  });
}

void showSmartSocketsUi(fg::UserInterface* ui, fg::Fridgecloud* cloud) {
  using namespace fg;
  ui_handle = ui;
  smart_socket_cloud_handle = cloud;

  auto menu = ui->push<SelectMenu>();
  menu->addOption("back...", [ui]() { ui->pop(); });

  menu->addOption("test socket", []() {
    showSmartSocketTestSelection(0);
  });

  menu->addOption("connect socket", []() {
    if(!wifi_configured) {
      ui_handle->push<TextDisplay>("wifi not configured", 1, []() {
        ui_handle->pop();
      });
      return;
    }
    runConnectSocketFlow();
  });

  menu->addOption("disconnect", []() {
    const std::vector<std::string>& roles = getSocketRolesList();
    std::vector<std::string> disconnect_options;
    disconnect_options.push_back("back");

    // Show only roles that currently have a socket assigned.
    for(size_t i = 1; i < roles.size(); ++i) {
      if(isSocketRoleConnected(roles[i])) {
        disconnect_options.push_back(roles[i]);
      }
    }

    if(disconnect_options.size() == 1) {
      ui_handle->push<TextDisplay>("no socket assigned", 1, []() {
        ui_handle->pop();
      });
      return;
    }

    ui_handle->push<SelectInput>("disconnect socket", 0, disconnect_options, [disconnect_options](unsigned selected) {
      ui_handle->pop();

      if(selected == 0) {
        return;
      }

      const std::string selected_role = disconnect_options[selected];
      const std::string key = socketRoleKey(selected_role);
      const std::string socket_ip = sanitizeSettingString(fg::settings().getStr(key.c_str()));

      fg::settings().erase(key.c_str());
      fg::settings().commit();

      std::string mqtt_password = sanitizeSettingString(fg::settings().getStr("mqtt_pass"));
      if(mqtt_password.empty()) {
        fg::SettingsManager provisioning(NVS_PART, "fg_provisioning");
        mqtt_password = sanitizeSettingString(provisioning.getStr("mqtt_password"));
      }

      if(!socket_ip.empty() && !mqtt_password.empty()) {
        const std::string auth_query = "user=admin&password=" + urlEncode(mqtt_password) + "&";
        httpGet("http://" + socket_ip + "/cm?" + auth_query + "cmnd=Reset%201");
      }

      ui_handle->push<TextDisplay>("socket disconnected", 1, []() {
        ui_handle->pop();
      });
    });
  });
}

void showWifiUi(fg::UserInterface* ui, fg::Fridgecloud* cloud) {
  using namespace fg;

  ui_handle = ui;

  auto menu = ui->push<SelectMenu>();

  menu->addOption("back...", [ui](){ ui->pop(); });

  if(wifi_configured) {

    menu->addOption("Show Wifi Status", [ui](){
      ui->push<WifiStaDash>(WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), static_cast<float>(WiFi.RSSI()), [ui]() {
        ui->pop();
      });
    });

    menu->addOption("clear saved wifi", [ui](){
      resetCredentials();
      ui_handle->push<TextDisplay>("wifi connection cleared");
      ui_handle->loop();
      vTaskDelay(10000 / portTICK_PERIOD_MS);
      ESP.restart();
    });

#ifdef ENABLE_CUSTOM_MQTT
    menu->addOption("custom connection", [ui, cloud](){
      custom_mqtt_server = fg::settings().getStr("mqtt_server");
      custom_mqtt_user = fg::settings().getStr("mqtt_user");
      custom_mqtt_port = fg::settings().getStr("mqtt_port");
      custom_mqtt_pass = fg::settings().getStr("mqtt_pass");
      custom_mqtt_id = fg::settings().getStr("mqtt_id");
      custom_mqtt_enabled = fg::settings().getU8("mqtt_enabled");

      if(custom_mqtt_port == "") {
        custom_mqtt_port = "1883";
      }
      if(custom_mqtt_id == "") {
        custom_mqtt_id = "plantalytix";
      }

      auto mqttmenu = ui_handle->push<SelectMenu>();
      mqttmenu->addOption("back...", [ui](){ ui->pop(); });

      if(custom_mqtt_enabled) {
        mqttmenu->addOption("disconnect", [ui](){
          ui_handle->pop();
          fg::settings().setU8("mqtt_enabled", 0);
          ESP.restart();
        });
      }
      else {
        mqttmenu->addOption("MQTT Server", [ui](){
          ui_handle->push<TextEntry>("MQTT Server", custom_mqtt_server, [](std::string _mqtt_server) {
            custom_mqtt_server = _mqtt_server;
            ui_handle->pop();
          });
        });
        mqttmenu->addOption("MQTT User", [ui](){
          ui_handle->push<TextEntry>("MQTT User", custom_mqtt_user, [](std::string _mqtt_user) {
            custom_mqtt_user = _mqtt_user;
            ui_handle->pop();
          });
        });
        mqttmenu->addOption("MQTT Port", [ui](){
          ui_handle->push<TextEntry>("MQTT Port", custom_mqtt_port, [](std::string _mqtt_port) {
            custom_mqtt_port = _mqtt_port;
            ui_handle->pop();
          });
        });
        mqttmenu->addOption("MQTT Password", [ui](){
          ui_handle->push<TextEntry>("MQTT Password", custom_mqtt_pass, [](std::string _mqtt_pass) {
            custom_mqtt_pass = _mqtt_pass;
            ui_handle->pop();
          });
        });
        mqttmenu->addOption("MQTT Identifier", [ui](){
          ui_handle->push<TextEntry>("MQTT Identifier", custom_mqtt_id, [](std::string _mqtt_id) {
            custom_mqtt_id = _mqtt_id;
            ui_handle->pop();
          });
        });
        mqttmenu->addOption("connect", [ui](){
          ui_handle->pop();
          fg::settings().setStr("mqtt_server", custom_mqtt_server.c_str());
          fg::settings().setStr("mqtt_user", custom_mqtt_user.c_str());
          fg::settings().setStr("mqtt_pass", custom_mqtt_pass.c_str());
          fg::settings().setStr("mqtt_port", custom_mqtt_port.c_str());
          fg::settings().setStr("mqtt_id", custom_mqtt_id.c_str());

          auto client = new EspMQTTClient(
            custom_mqtt_server.c_str(),  // MQTT Broker server ip
            atoi(custom_mqtt_port.c_str()),              // The MQTT port, default to 1883. this line can be omitted
            custom_mqtt_user.c_str(),   // Can be omitted if not needed
            custom_mqtt_pass.c_str(),   // Can be omitted if not needed
            "fridge"     // Client name that uniquely identify your device
          );

          TickType_t connection_timeout = xTaskGetTickCount();
          while(xTaskGetTickCount() - connection_timeout < configTICK_RATE_HZ * 5.0) {
            client->loop();
            if(client->isMqttConnected()) {
              fg::settings().setU8("mqtt_enabled", 1);
              ui_handle->push<TextDisplay>("connected", 1, []() {
                ESP.restart();
              });
              while(1) { ui_handle->loop(); }
            }
          }
          ui_handle->push<TextDisplay>("connection failed", 1, []() {
            ui_handle->pop();
          });
        });
      }
    });
#endif

  if(!custom_mqtt_enabled) {

      menu->addOption("change server", [=](){
        ui_handle->push<TextEntry>("server url", "#API_URL_EXTERNAL#", [=](std::string url) {
          ui_handle->pop();
          ui_handle->push<TextEntry>("join password", [=](std::string password) {
            ui_handle->pop();
            ui_handle->push<TextDisplay>("connecting...");
            ui_handle->loop();

            cloud->registerWithCloud(url, password);

            ui_handle->pop();
            ui_handle->push<TextDisplay>("connection failed!", 1, []() {
              ui_handle->pop();
            });
            ui_handle->loop();
          });
        });
      });

      menu->addOption("connect to portal", [=](){
        ui_handle->push<TextDisplay>("connecting...");
        ui_handle->loop();
        std::string code = cloud->requestPairingCode();
        ui_handle->pop();
        if(code.size()) {
          ui_handle->push<TextDisplay>(code.c_str(), "pairing code", 2, [](){
            ui_handle->pop();
          });
        }
        else {
          ui_handle->push<TextDisplay>("failed to connect to cloud", 1, [](){
            ui_handle->pop();
          });
        }
      });
    }

  }

  else {

    menu->addOption("use mobile phone", [ui](){
      createConfigurationAP();
      ui->push<WifiApDash>(ssid, ip, [ui]() {
        ui->pop();
      });
    });

    menu->addOption("use display", [=](){
      ui_handle->push<TextDisplay>("scanning...");
      ui_handle->loop();
      scanned_ssids = scanWifiNetworks();
      scanned_ssids.insert(scanned_ssids.begin(), "back");
      ui_handle->pop();
      ui_handle->push<fg::SelectInput>("select network", 0, scanned_ssids, [=](unsigned selected) {
        primary_ssid = scanned_ssids[selected].c_str();
        ui_handle->pop();
        if(selected != 0) {
          ui_handle->push<TextEntry>("enter password", [=](std::string password) {
            primary_password = password.c_str();
            Serial.println(primary_ssid.c_str());
            Serial.println(primary_password.c_str());
            ui_handle->pop();
            ui_handle->push<TextDisplay>("connecting...");
            ui_handle->loop();
            if(connectToWifi(primary_ssid, primary_password)) {
              ui_handle->pop();
              Serial.println(primary_ssid.c_str());
              Serial.println(primary_password.c_str());

              saveWifiCredentials();
              ui_handle->push<TextDisplay>("connected!", 1, []() {
                ESP.restart();
              });
            }
            else {
              ui_handle->pop();
              ui_handle->push<TextDisplay>("connection failed", 1, []() {
                ui_handle->pop();
              });
            }
          });

        }
      });
    });

  }



}


std::string randomSsid() {
  std::string ssid(DEFAULT_SSID_PREFIX);
  srand(time(NULL));
  for(auto i = 0; i < 6; i++) {
    auto c = random(16);
    if(c < 10) {
      ssid.push_back('0' + c);
    }
    else {
      ssid.push_back('A' + c);
    }
  }
  return ssid;
}

void handleNotFound() {
  server.sendHeader("Location", "/portal");
  server.send(302, "text/plain", "redirect to captive portal");
}

void InitalizeHTTPServer() {
  server.on("/config", handleConfig);
  server.on("/portal", handleRoot);
  server.on("/scan", handleGetScan);
  server.onNotFound ( handleNotFound );

  server.begin();
}

boolean createConfigurationAP()
{
  ip = apIP.toString().c_str();
  netmask = netMsk.toString().c_str();

  WiFi.disconnect();
  WiFi.mode(WIFI_AP_STA);
  Serial.print(F("Initalize SoftAP "));
  ssid = randomSsid();

  if (WiFi.softAP(ssid.c_str()))
  {
    delay(2000);
    //WiFi.softAPConfig(apIP, apIP, netMsk);
    dnsServer.start();
    Serial.println(F("successful."));
    InitalizeHTTPServer();
    server_active = true;
    return true;
  }
  else {
    Serial.println(F("Soft AP Error."));
    return false;
  }
}

bool connectToWifi(std::string ssid, std::string password) {
  Serial.print(F("Connecting to wifi network "));
  Serial.println(ssid.c_str());
  delay(1000);

  if(wifiIsConnected()) {
    WiFi.disconnect();
    while(wifiIsConnected()) {
      vTaskDelay(1000 / portTICK_PERIOD_MS);
      status = WiFi.status();
      Serial.println(F("Status:"));
      Serial.println(status);
    }
  }
  //WiFi.scanDelete();

  if(password != "") {
    WiFi.begin(ssid.c_str(), password.c_str());
  }
  else {
    WiFi.begin(ssid.c_str());
  }

  Serial.println(F("Status:"));
  Serial.println(status);

  wl_status_t status = WL_IDLE_STATUS;
  unsigned int timeout = 0;

  do {
    delay(10);
    status = WiFi.status();
    switch(status) {
      case WL_NO_SHIELD :
      case WL_IDLE_STATUS :
      case WL_CONNECTED :
      case WL_SCAN_COMPLETED :
      case WL_DISCONNECTED :
        break;
      case WL_NO_SSID_AVAIL :
      case WL_CONNECT_FAILED :
      case WL_CONNECTION_LOST :
      default:
        Serial.println(F("Connection failed."));
        Serial.println(status);
        WiFi.disconnect();
        WiFi.setAutoConnect(false);
        return false;
    }

    if(timeout++ > 1000) {
      Serial.println(F("Connection timeout."));
      WiFi.disconnect();
      WiFi.setAutoConnect(false);
      return false;
    }
    delay(10);
    esp_task_wdt_reset();
  } while(status != WL_CONNECTED);

  Serial.println(F("Connection successful."));
  Serial.println("IP address: ");
  Serial.print(WiFi.localIP());
  Serial.print(" / ");
  Serial.println(WiFi.macAddress());
  WiFi.setAutoConnect(true);
  return true;
}

bool wifiIsConnected() {
  auto wifi_status = WiFi.status();
  switch(wifi_status) {
    case WL_CONNECTED :
      return true;
    case WL_NO_SHIELD :
    case WL_IDLE_STATUS :
    case WL_SCAN_COMPLETED :
    case WL_DISCONNECTED :
    case WL_NO_SSID_AVAIL :
    case WL_CONNECT_FAILED :
    case WL_CONNECTION_LOST :
    default:
      return false;
  }
}




bool loadWifiCredentials()
{
  // fg::settings().setStr("pssid", "TESTNET");
  // fg::settings().setStr("ppassword", "aaaaaaaa");
  if(fg::settings().has("pssid")) {
    primary_ssid = fg::settings().getStr("pssid");
    primary_password = fg::settings().getStr("ppassword");
    secondary_ssid = fg::settings().getStr("sssid");
    secondary_password = fg::settings().getStr("spassword");
    return true;
  }
  else {
    return false;
  }
}

/** Store WLAN credentials to EEPROM */

void saveWifiCredentials() {
  Serial.println("saving credentials");
  Serial.println(primary_ssid.c_str());
  Serial.println(primary_password.c_str());
  fg::settings().setStr("pssid", primary_ssid.c_str());
  fg::settings().setStr("ppassword", primary_password.c_str());
  fg::settings().commit();
}

void resetCredentials() {
  fg::settings().erase("pssid");
  fg::settings().commit();
}

#define CHUNK_LEN 2048

void handleRoot() {
  using base64 = cppcodec::base64_rfc4648;

  auto len = strlen(INDEX_HTML_COMPRESSED);
  auto pos = 0;
  char chunk[CHUNK_LEN + 1];

  // HTML Header
  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Expires", "-1");
  server.setContentLength(INDEX_HTML_SIZE);
  server.send ( 200, "text/html", "" );

  try {
    // HTML Content
    while(pos < len) {
      strncpy_P(chunk, INDEX_HTML_COMPRESSED + pos, CHUNK_LEN);
      chunk[CHUNK_LEN] = '\0';
      std::vector<uint8_t> decoded = base64::decode(chunk);
      decoded.push_back('\0');
      Serial.println((int)decoded.size());
      const char* html = reinterpret_cast<const char*>(decoded.data());
      server.sendContent(html);
      pos += CHUNK_LEN;
    }

    server.client().stop();
  }
  catch(...) {
    Serial.println("exceptioN!!!");
  }

}

/** Wifi config page handler */
void handleConfig() {
  String body = server.arg("plain");
  Serial.println(body);

  StaticJsonDocument<200> config_data;
  if(auto error = deserializeJson(config_data, body)) {
    Serial.print(F("deserializeJson() failed: "));
    Serial.println(error.f_str());
    return;
  }

  primary_ssid = config_data["primary"]["ssid"].as<std::string>();
  primary_password = config_data["primary"]["password"].as<std::string>();

  bool connected = connectToWifi(primary_ssid, primary_password);

  if(connected) {
    saveWifiCredentials();
    server.send ( 200, "text/html", "ok" );
    server.client().stop();
    delay(10000);
    ESP.restart();
  }
  else {
    server.send ( 200, "text/html", "error" );
    server.client().stop();
  }
}

void handleGetScan() {
  auto ssids = scanWifiNetworks();
  StaticJsonDocument<1024> response;

  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Expires", "-1");

  for(auto ssid : ssids) {
    response.add(ssid);
  }

  std::stringstream stream;
  serializeJson(response, stream);

  server.send (200, "application/json", stream.str().c_str());
}


/** Is this an IP? */
boolean isIp(String str) {
  for (int i = 0; i < str.length(); i++) {
    int c = str.charAt(i);
    if (c != '.' && (c < '0' || c > '9')) {
      return false;
    }
  }
  return true;
}

String GetEncryptionType(byte thisType) {
  String Output = "";
   // read the encryption type and print out the name:
   switch (thisType) {
     case 5:
       Output = "WEP";
       return Output;
       break;
     case 2:
       Output = "WPA";
       return Output;
       break;
     case 4:
       Output = "WPA2";
       return Output;
       break;
     case 7:
       Output = "None";
       return Output;
       break;
     default:
     case 8:
       Output = "Auto";
       return Output;
      break;
   }
}

/** IP to String? */
String toStringIp(IPAddress ip) {
  String res = "";
  for (int i = 0; i < 3; i++) {
    res += String((ip >> (8 * i)) & 0xFF) + ".";
  }
  res += String(((ip >> 8 * 3)) & 0xFF);
  return res;
}

String formatBytes(size_t bytes) {            // lesbare Anzeige der Speichergrößen
   if (bytes < 1024) {
     return String(bytes) + " Byte";
   } else if (bytes < (1024 * 1024)) {
     return String(bytes / 1024.0) + " KB";
   } else  {
     return String(bytes / 1024.0 / 1024.0) + " MB";
   }
}

std::string sanitizeSettingString(const std::string& value) {
  return std::string(value.c_str());
}

std::string urlEncode(const std::string& value) {
  static const char* hex = "0123456789ABCDEF";
  std::string encoded;
  encoded.reserve(value.size() * 3);

  for(unsigned char c : value) {
    if((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
      encoded.push_back(static_cast<char>(c));
    }
    else {
      encoded.push_back('%');
      encoded.push_back(hex[(c >> 4) & 0x0F]);
      encoded.push_back(hex[c & 0x0F]);
    }
  }

  return encoded;
}

bool httpGet(const std::string& url, std::string* response) {
  HTTPClient http;
  if(!http.begin(url.c_str())) {
    return false;
  }

  http.setTimeout(10000);
  int code = http.GET();
  if(response != nullptr && code > 0) {
    *response = std::string(http.getString().c_str());
  }
  http.end();

  return code >= 200 && code < 300;
}

bool parseSmartSocketIp(const std::string& body, std::string& socket_ip) {
  DynamicJsonDocument response(256);
  if(deserializeJson(response, body.c_str())) {
    return false;
  }

  std::string ip_field = response["IPAddress1"].as<std::string>();
  if(ip_field.empty()) {
    return false;
  }

  ip_field = sanitizeSettingString(ip_field);
  auto start = ip_field.find('(');
  auto end = ip_field.find(')', start == std::string::npos ? 0 : start + 1);

  std::string parsed = ip_field;
  if(start != std::string::npos && end != std::string::npos && end > start + 1) {
    parsed = ip_field.substr(start + 1, end - start - 1);
  }

  if(!isIp(parsed.c_str())) {
    return false;
  }

  socket_ip = parsed;
  return true;
}

void delayWithWatchdog(uint32_t delay_ms) {
  uint32_t remaining = delay_ms;
  while(remaining > 0) {
    uint32_t step = remaining > 200 ? 200 : remaining;
    vTaskDelay(step / portTICK_PERIOD_MS);
    esp_task_wdt_reset();
    remaining -= step;
  }
}

bool isSocketRoleConnected(const std::string& role) {
  std::string socket_key = socketRoleKey(role);
  return fg::settings().has(socket_key.c_str()) && !fg::settings().getStr(socket_key.c_str()).empty();
}

std::string socketRoleKey(const std::string& role) {
  // NVS key length is limited, keep all keys <= 15 chars.
  if(role == "dehumidifier") return "sock_dehum";
  if(role == "heater") return "sock_heat";
  if(role == "light") return "sock_light";
  if(role == "secondary_light") return "sock_slight";
  if(role == "co2") return "sock_co2";
  if(role == "other1") return "sock_oth1";
  if(role == "other2") return "sock_oth2";
  if(role == "other3") return "sock_oth3";
  return "sock_misc";
}

const std::vector<std::string>& getSocketRolesList() {
  static const std::vector<std::string> roles = {
    "back",
    "dehumidifier",
    "heater",
    "light",
    "secondary_light",
    "co2",
  };
  return roles;
}

std::vector<std::string> getSocketRoleOptions() {
  const std::vector<std::string>& base_roles = getSocketRolesList();

  std::vector<std::string> role_options;
  role_options.reserve(base_roles.size());

  for(const auto& role : base_roles) {
    if(role == "back") {
      role_options.push_back(role);
    }
    else {
      std::string display_name = role;
      if(isSocketRoleConnected(role)) {
        display_name = "* " + display_name;
      }
      role_options.push_back(display_name);
    }
  }

  return role_options;
}

bool provisionSmartSocket(const std::string& socket_role, const std::string& home_ssid, const std::string& home_password, std::string& socket_ip, std::string& error_message, const std::function<void(const char*)>& progress_callback) {
  auto emit_status = [&](const char* message) {
    Serial.println(message);
    if(progress_callback) {
      progress_callback(message);
    }
  };

  const std::string home_ssid_clean = sanitizeSettingString(home_ssid);
  const std::string home_password_clean = sanitizeSettingString(home_password);
  const std::string socket_name = "socket_" + socket_role;

  emit_status("wifi cfg send...");
  delayWithWatchdog(2000);
  std::string wifi_url = "http://192.168.4.1/wi?s1=" + urlEncode(home_ssid_clean) + "&p1=" + urlEncode(home_password_clean) + "&h=" + urlEncode(socket_name) + "&save=";
  if(!httpGet(wifi_url)) {
    error_message = "wifi setup fail";
    return false;
  }

  emit_status("sent successful");
  delayWithWatchdog(2000);
  emit_status("wait for wifi...");
  delayWithWatchdog(8000);

  std::string ip_response;
  bool ip_command_ok = httpGet("http://192.168.4.1/cm?cmnd=IPAddress1", &ip_response);

  // Always return to the original fridge Wi-Fi right after issuing the IPAddress1 command.
  emit_status("reconnect wifi");
  if(!connectToWifi(home_ssid_clean, home_password_clean)) {
    error_message = "reconnect fail";
    return false;
  }

  if(!ip_command_ok || !parseSmartSocketIp(ip_response, socket_ip)) {
    error_message = "ip lookup fail";
    return false;
  }

  std::string mqtt_password = sanitizeSettingString(fg::settings().getStr("mqtt_pass"));
  if(mqtt_password.empty()) {
    fg::SettingsManager provisioning(NVS_PART, "fg_provisioning");
    mqtt_password = sanitizeSettingString(provisioning.getStr("mqtt_password"));
  }

  if(mqtt_password.empty()) {
    error_message = "mqtt pass miss";
    return false;
  }

  const std::string tasmota_template = "%7B%22NAME%22%3A%22Generic%22%2C%22GPIO%22%3A%5B1%2C1%2C1%2C32%2C2720%2C2656%2C1%2C1%2C2624%2C288%2C224%2C1%2C1%2C1%5D%2C%22FLAG%22%3A0%2C%22BASE%22%3A18%7D";

  emit_status("config socket");
  delayWithWatchdog(2000);
  std::string config_url = "http://" + socket_ip + "/co?t1=" + tasmota_template + "&wp=" + urlEncode(mqtt_password) + "&b3=on&dn=" + urlEncode(socket_name) + "&a0=" + urlEncode(socket_name) + "&b2=0&save=";
  if(!httpGet(config_url)) {
    error_message = "config fail";
    return false;
  }

  std::string socket_key = socketRoleKey(socket_role);
  fg::settings().setStr(socket_key.c_str(), socket_ip.c_str());
  fg::settings().commit();

  emit_status("socket configured");
  delayWithWatchdog(2000);
  emit_status("wait for socket");
  delayWithWatchdog(6000);
  emit_status("test power on...");
  delayWithWatchdog(2000);

  const std::string auth_query = "user=admin&password=" + urlEncode(mqtt_password) + "&";

  if(!httpGet("http://" + socket_ip + "/cm?" + auth_query + "cmnd=Power%20On")) {
    error_message = "power on fail";
    return false;
  }

  emit_status("test success");
  delayWithWatchdog(2000);
  emit_status("waiting...");
  delayWithWatchdog(6000);
  emit_status("test power off...");
  delayWithWatchdog(2000);

  if(!httpGet("http://" + socket_ip + "/cm?" + auth_query + "cmnd=Power%20Off")) {
    error_message = "power off fail";
    return false;
  }
  emit_status("test success");
  delayWithWatchdog(2000);

  return true;
}

bool isHexSegment(const std::string& value, size_t expected_len) {
  if(value.size() != expected_len) {
    return false;
  }

  for(unsigned char c : value) {
    if(!std::isxdigit(c)) {
      return false;
    }
  }

  return true;
}

bool isSmartSocketSsid(const std::string& value) {
  static const std::string prefix = "cozylife-";
  if(value.rfind(prefix, 0) != 0) {
    return false;
  }

  std::string suffix = value.substr(prefix.size());
  auto divider_pos = suffix.find('-');
  if(divider_pos == std::string::npos || suffix.find('-', divider_pos + 1) != std::string::npos) {
    return false;
  }

  return isHexSegment(suffix.substr(0, divider_pos), 6) && isHexSegment(suffix.substr(divider_pos + 1), 4);
}

std::vector<std::string> scanSmartSocketSsids() {
  std::vector<std::string> all_ssids = scanWifiNetworks();
  std::vector<std::string> smart_socket_ssids;

  for(const auto& network_ssid : all_ssids) {
    if(isSmartSocketSsid(network_ssid)) {
      smart_socket_ssids.push_back(network_ssid);
    }
  }

  return smart_socket_ssids;
}

std::string smartSocketDisplayName(const std::string& ssid) {
  static const std::string prefix = "cozylife-";
  if(ssid.rfind(prefix, 0) == 0) {
    return ssid.substr(prefix.size());
  }

  return ssid;
}

std::vector<std::string> scanWifiNetworks() {
  WiFi.scanNetworks(true);
  int n = 0;
  auto scanstart = xTaskGetTickCount();
  while(n <= 0) {
    n = WiFi.scanComplete();
    esp_task_wdt_reset();
    if(xTaskGetTickCount() - scanstart > WIFI_SCAN_TIMEOUT) {
      n = 0;
    }
  }

  std::vector<std::string> ssids;

  Serial.println("Scan done");
  if (n == 0) {
      Serial.println("no networks found");
  } else {
      Serial.print(n);
      Serial.println(" networks found");
      Serial.println("Nr | SSID                             | RSSI | CH | Encryption");
      for (int i = 0; i < n; ++i) {
          // Print SSID and RSSI for each network found
          Serial.printf("%2d",i + 1);
          Serial.print(" | ");
          Serial.printf("%-32.32s", WiFi.SSID(i).c_str());
          Serial.print(" | ");
          Serial.printf("%4d", WiFi.RSSI(i));
          Serial.print(" | ");
          Serial.printf("%2d", WiFi.channel(i));
          Serial.print(" | ");
          switch (WiFi.encryptionType(i))
          {
          case WIFI_AUTH_OPEN:
              Serial.print("open");
              break;
          case WIFI_AUTH_WEP:
              Serial.print("WEP");
              break;
          case WIFI_AUTH_WPA_PSK:
              Serial.print("WPA");
              break;
          case WIFI_AUTH_WPA2_PSK:
              Serial.print("WPA2");
              break;
          case WIFI_AUTH_WPA_WPA2_PSK:
              Serial.print("WPA+WPA2");
              break;
          case WIFI_AUTH_WPA2_ENTERPRISE:
              Serial.print("WPA2-EAP");
              break;
          default:
              Serial.print("unknown");
          }
          Serial.println();
          ssids.push_back(WiFi.SSID(i).c_str());
          delay(10);
      }
  }
  Serial.println("");

  // Delete the scan result to free memory for code below.
  WiFi.scanDelete();
  return ssids;
}
