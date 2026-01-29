#include <memory>
#include <queue>
#include <sstream>
#include <EspMQTTClient.h>
#include <HTTPClient.h>
#include <esp_task_wdt.h>

#include "fridgecloud.h"
#include "observeable.h"
#include "ArduinoJson.h"
#include "time.h"

#ifndef FIRMWARE_VERSION
  #warning Firmware version undefinded!
  #define FIRMWARE_VERSION "UNDEFINED"
  #define NO_FIRMWARE_UPDATE
#endif


namespace fg {

  static unsigned long getTime() {
    time_t now;
    time(&now);
    return now;
  }

  void Fridgecloud::init() {

    SettingsManager provisioning(NVS_PART, "fg_provisioning");

    if(fg::settings().getU8("mqtt_enabled")) {
      device_id = fg::settings().getStr("mqtt_id");
      mqtt_host = fg::settings().getStr("mqtt_server");
      mqtt_user = fg::settings().getStr("mqtt_user");
      mqtt_port = fg::settings().getStr("mqtt_port");
      mqtt_password = fg::settings().getStr("mqtt_pass");
      custom_mqtt = true;
    }
    else {

      device_id = provisioning.getStr("device_id");
      mqtt_user = provisioning.getStr("mqtt_user");
      mqtt_password = provisioning.getStr("mqtt_password");

      mqtt_host = MQTT_HOST;
      mqtt_port = MQTT_PORT;
      api_url = API_URL;

    }

    Serial.print("FIRMWARE VERSION: ");
    Serial.println(FIRMWARE_VERSION);

    topic_configuration = String() + "/devices/" + device_id.c_str() + "/configuration";
    topic_fetch = String() + "/devices/" + device_id.c_str() + "/fetch";
    topic_status = String() + "/devices/" + device_id.c_str() + "/status";
    topic_bulk = String() + "/devices/" + device_id.c_str() + "/bulk";
    topic_log = String() + "/devices/" + device_id.c_str() + "/log";
    topic_firmware = String() + "/devices/" + device_id.c_str() + "/firmware";
    topic_fwupdate = String() + "/devices/" + device_id.c_str() + "/fwupdate";
    topic_command = String() + "/devices/" + device_id.c_str() + "/command";
    topic_control = String() + "/devices/" + device_id.c_str() + "/control/#";

    Serial.print("api url:\t");
    Serial.println(api_url.c_str());
    Serial.print("device_id:\t");
    Serial.println(device_id.c_str());
    Serial.print("mqtt_user:\t");
    Serial.println(mqtt_user.c_str());
    Serial.print("mqtt_password:\t");
    Serial.println(mqtt_password.c_str());
    Serial.print("mqtt_host:\t");
    Serial.println(mqtt_host.c_str());
    Serial.print("mqtt_port:\t");
    Serial.println(mqtt_port.c_str());

    client = std::unique_ptr<EspMQTTClient>(new EspMQTTClient(
      mqtt_host.c_str(),  // MQTT Broker server ip
      atoi(mqtt_port.c_str()),              // The MQTT port, default to 1883. this line can be omitted
      mqtt_user.c_str(),   // Can be omitted if not needed
      mqtt_password.c_str(),   // Can be omitted if not needed
      device_id.c_str()     // Client name that uniquely identify your device
    ));

    //log("message-device-booted");

  }

  void Fridgecloud::connect() {
    Serial.println("connecting to cloud");

    client->setMaxPacketSize(1024);

    client->subscribe(topic_configuration.c_str(), [&](const String & topic, const String & payload) {
      Serial.println("new config");
      config_subject.next(payload);
    });

    client->subscribe(topic_firmware.c_str(), [&](const String & topic, const String & payload) {
      Serial.println("loading firmware: " + payload);
#ifndef NO_FIRMWARE_UPDATE
      if(payload != FIRMWARE_VERSION) {
        log("message-device-firmware-update");
        update_subject.next(true);
        updateFirmware(payload.c_str());
      }
#endif
    });

    client->subscribe(topic_fwupdate.c_str(), [&](const String & topic, const String & payload) {
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, payload);
      if (error) {
        Serial.println("error parsing received command");
        return;
      }

      Serial.printf("loading firmware: %s\n\r", doc["version"]);
#ifndef NO_FIRMWARE_UPDATE
      if(doc["version"] != FIRMWARE_VERSION) {
        log("message-device-firmware-update");
        update_subject.next(true);
        updateFirmwareFromUrl(doc["url"]);
      }
#endif
    });

    client->subscribe(topic_command.c_str(), [&](const String & topic, const String & payload) {
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, payload);
      if (error) {
        Serial.println("error parsing received command");
        return;
      }

      command_subject.next(doc);
    });

    client->subscribe(topic_control.c_str(), [&](const String & topic, const String & payload) {
      auto output = topic.substring(topic_control.length() - 1);      
      control_subject.next(std::pair<std::string, std::string>(output.c_str(), payload.c_str()));
    });

    client->publish(topic_fetch.c_str(), "hello");

    Serial.println("Connected to mqtt server");

  }

  void Fridgecloud::log(std::string message, unsigned int severity) {
    log_queue.push({message, severity});
  }

  void Fridgecloud::loop() {
    client->loop();
    if(connected != client->isMqttConnected()) {
      connected = client->isMqttConnected();
      if(connected) {
        Serial.println("(re)connected to mqtt server.");
        StaticJsonDocument<1024> message_json;
        message_json["firmware_id"] = FIRMWARE_VERSION;
        std::stringstream stream;
        serializeJson(message_json, stream);

        client->publish(topic_fetch.c_str(), stream.str().c_str());
        connect();
      }
      else {
        Serial.println("lost connection to mqtt server.");
      }
    }
    if(connected) {
      while(log_queue.size()) {
        StaticJsonDocument<1024> message_json;
        message_json["severity"] = log_queue.front().second;
        message_json["message"] =  log_queue.front().first.c_str();
        std::stringstream stream;
        serializeJson(message_json, stream);

        if(client->publish(topic_log.c_str(), stream.str().c_str())) {
          Serial.println(log_queue.front().first.c_str());
          log_queue.pop();
        }
        else {
          break;
        }
      }
    }
  }

  void Fridgecloud::updateStatus(DynamicJsonDocument status) {
    time_t now;
    struct tm * ptm;
    struct tm timeinfo;
    static bool overflow = false;

    if(!custom_mqtt) {
      if(++current_sample >= SAMPLE_INTERVAL) {
        if(status_buffer.size() > MAX_BUFFER_LEN) {
          status_buffer.erase(status_buffer.begin());
          if(!overflow) {
            overflow = true;
            log("message-buffer-overflow", 1);
          }
        }
        else {
          overflow = false;
        }

        auto epochTime = getTime();

        if(epochTime > 1000000000) { // ignore invalid system time
          status["timestamp"] = epochTime;

          std::stringstream stream;
          serializeJson(status, stream);
          status_buffer.push_back(stream.str());

          if(status_buffer.size() >= UPLOAD_INTERVAL) {
            uploadStatus();
          }
        }

        current_sample = 0;
        Serial.println(status_buffer.size());
      }
    }
    else {
      for(auto kv : status["sensors"].as<JsonObject>()) {
        auto topic = topic_status + "/sensors/" + kv.key().c_str();
        client->publish(topic.c_str(), kv.value());
      }
      for(auto kv : status["outputs"].as<JsonObject>()) {
        auto topic = topic_status + "/outputs/" + kv.key().c_str();
        client->publish(topic.c_str(), kv.value());
      }
    }
  }

  void Fridgecloud::uploadStatus() {
    Serial.println("Uploading bulk status");
    if(!connected) {
      Serial.println("not connected to mqtt!");
      return;
    }

    try {
      while(status_buffer.size()) {
        if(!client->publish(topic_bulk.c_str(), status_buffer[0].c_str())) {
          Serial.println("mqtt publish error");
          return;
        }
        status_buffer.erase(status_buffer.begin());
      }
      status_buffer.clear();
    }
    catch(...) {
      Serial.println("exception uploading status!");
    }
    Serial.println("uploadStatus done");
  }

  void Fridgecloud::updateConfig(const char* data) {
    if(!connected) { return; }
    try {
      Serial.println("sending config to cloud");
      Serial.println(reinterpret_cast<uint32_t>(client.get()));
      client->publish(topic_configuration.c_str(), data);
    }
    catch(...) {
      Serial.println("exception uploading config!");
    }
  }

  void Fridgecloud::updateFirmware(std::string fw_id) {
    std::string update_url = api_url.c_str();
    update_url += "/device/firmware/";
    update_url += fw_id;
    update_url += "/firmware.bin";
    Serial.println(update_url.c_str());

    updateFirmwareFromUrl(update_url);
  }

  void Fridgecloud::updateFirmwareFromUrl(std::string update_url) {
    HTTPClient http;

    Serial.println("Updating FW from URL:");
    Serial.println(update_url.c_str());

    http.begin(update_url.c_str());

    int httpResponseCode = http.GET();
    if (httpResponseCode>0) {
      Serial.print("HTTP Response code: ");
      Serial.println(httpResponseCode);
      auto str = http.getStream();

      if (!Update.begin(0XFFFFFFFF)) { //start with max available size
        Update.printError(Serial);
      }

      // get length of document (is -1 when Server sends no Content-Length header)
      int len = http.getSize();

      // create buffer for read
      uint8_t buff[128] = { 0 };

      // get tcp stream
      WiFiClient * stream = http.getStreamPtr();

      float percent = 0;
      int maxlen = len;
      auto display = ui.push<UpdateDisplay>();
      // read all data from server
      while(http.connected() && (len > 0 || len == -1)) {
        // get available data size
        size_t size = stream->available();
        ui.loop();
        if(size) {
          // read up to 128 byte
          int c = stream->readBytes(buff, ((size > sizeof(buff)) ? sizeof(buff) : size));
          if (Update.write(buff, c) != c) {
            Update.printError(Serial);
          }
          if(percent != 100 - (100 * len) / maxlen) {
            percent = 100 - (100 * len) / maxlen;
            Serial.print("update: ");
            Serial.print(percent);
            Serial.println("%");
            display->setPercent(percent);
            ui.next(); //prevent display blanking
          }

          if(len > 0) {
            len -= c;
          }
        }
        delay(1);
        esp_task_wdt_reset();
      }

      if (Update.end(true)) { //true to set the size to the current progress
        Serial.println("Update done.\nRebooting...\n");
        ESP.restart();
      } else {
        Update.printError(Serial);
      }
    }
    else {
      Serial.print("Error code: ");
      Serial.println(httpResponseCode);
    }
    // Free resources
    http.end();
    update_subject.next(false);
  }

  std::string Fridgecloud::requestPairingCode() {
    HTTPClient http;
    std::string url = api_url.c_str();
    url += "/device/claimcode";
    http.begin(url.c_str());
    http.addHeader("Content-Type", "application/json");
    DynamicJsonDocument request(1024);
    request["device_id"] = device_id;
    std::stringstream stream;
    serializeJson(request, stream);
    auto res = http.POST(stream.str().c_str());
    Serial.println(res);
    if(res == 200) {
      auto res_txt = http.getString();
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, res_txt);
      if (error) {
        Serial.println("error parsing received command");
        return "";
      }
      std::string claim_code = doc["claim_code"].as<std::string>();
      return claim_code;
    }
    return "";
  }

  bool Fridgecloud::registerWithCloud(std::string api_url, std::string password) {
    HTTPClient http;
    SettingsManager provisioning(NVS_PART, "fg_provisioning");

    std::string url = api_url + "/device/register";
    http.begin(url.c_str());
    http.addHeader("Content-Type", "application/json");
    DynamicJsonDocument request(1024);
    request["registration_password"] = password;
    request["device_type"] = HWTYPE;
    request["device_id"] = provisioning.getStr("device_id");
    request["username"] = provisioning.getStr("mqtt_user");
    request["password"] = provisioning.getStr("mqtt_password");
    std::stringstream stream;
    serializeJson(request, stream);
    auto res = http.POST(stream.str().c_str());
    Serial.println(res);
    if(res == 201) {
      auto res_txt = http.getString();
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, res_txt);
      if (error) {
        Serial.println("error parsing received command");
      }
      else {
        std::string update_url = api_url.c_str();
        update_url += "/device/firmware/";
        update_url += doc["fw"].as<const char*>();
        update_url += "/firmware.bin";
        Serial.println(update_url.c_str());

        updateFirmwareFromUrl(update_url);
      }
    }
    return false;
  }
}

