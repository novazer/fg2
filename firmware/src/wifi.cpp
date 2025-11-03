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

#include "fridgecloud.h"

#include "cppcodec/base64_rfc4648.hpp"
#include "html_compressed/index.html.h"

#define WIFI_SCAN_TIMEOUT 30000


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
}

float rssi = 0;

std::string ui_ssid;
std::string ui_password;
fg::UserInterface* ui_handle;
std::vector<std::string> scanned_ssids;
std::string custom_mqtt_server;
std::string custom_mqtt_user;
std::string custom_mqtt_port;
std::string custom_mqtt_pass;
std::string custom_mqtt_id;
uint8_t custom_mqtt_enabled;

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
        ui_handle->push<TextEntry>("server url", "https://fg2.novazer.com/api", [=](std::string url) {
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
