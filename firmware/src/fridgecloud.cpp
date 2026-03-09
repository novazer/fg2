#include <memory>
#include <queue>
#include <sstream>
#include <cmath>
#include <algorithm>
#include <EspMQTTClient.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <esp_task_wdt.h>

#include "fridgecloud.h"
#include "observeable.h"
#include "ArduinoJson.h"
#include "time.h"

#include "cppcodec/base64_rfc4648.hpp"

#ifndef FIRMWARE_VERSION
  #warning Firmware version undefinded!
  #define FIRMWARE_VERSION "UNDEFINED"
  #define NO_FIRMWARE_UPDATE
#endif


namespace fg {
  using base64 = cppcodec::base64_rfc4648;

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
    topic_tunnel_read = String() + "/devices/" + device_id.c_str() + "/tunnel_read";
    topic_tunnel_write = String() + "/devices/" + device_id.c_str() + "/tunnel_write";
    topic_alarms = String() + "/devices/" + device_id.c_str() + "/alarms";

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

    log("message-device-booted");
  }

  void Fridgecloud::connect() {
    Serial.println("connecting to cloud");

    client->setMaxPacketSize(4096);

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
      DynamicJsonDocument doc(4096);
      DeserializationError error = deserializeJson(doc, payload);
      if (error) {
        Serial.println("error parsing received command");
        return;
      }

      if(doc["action"] == std::string("webhook")) {
        executeWebhook(doc);
        return;
      }

      command_subject.next(doc);
    });

    client->subscribe(topic_control.c_str(), [&](const String & topic, const String & payload) {
      auto output = topic.substring(topic_control.length() - 1);      
      control_subject.next(std::pair<std::string, std::string>(output.c_str(), payload.c_str()));
    });

    client->subscribe(topic_tunnel_write.c_str(), [&](const String & topic, const String & payload) {
      DynamicJsonDocument doc(1024);
      DeserializationError error = deserializeJson(doc, payload);
      if (error) {
        return;
      }

      std::string incomingId = doc["connection_id"].as<std::string>();

      handleTunnelCloses();

      // NEW: selection logic using tunnel array (no log statements here)
      int useIndex = -1;

      // 1) find a connected tunnel that matches the incoming id (reuse)
      for (int i = 0; i < Fridgecloud::TUNNEL_COUNT; ++i) {
        if (tunnels[i].client.connected() && tunnels[i].connectionId == incomingId) {
          useIndex = i;
          tunnels[i].openedAt = xTaskGetTickCount();
          break;
        }
      }

      // 1.5) Check if we have to disconnect anyways
      if (doc["disconnected"]) {
        if (useIndex == -1) {
            return;
        }

        tunnels[useIndex].client.stop();
        tunnels[useIndex].openedAt = 0;
        return;
      }

      // 2) if none found, find a non-connected tunnel to use
      if (useIndex == -1) {
        for (int i = 0; i < Fridgecloud::TUNNEL_COUNT; ++i) {
          if (!tunnels[i].client.connected()) {
            useIndex = i;
            tunnels[i].connectionId = incomingId;
            tunnels[i].sequence = 0;
            tunnels[i].openedAt = xTaskGetTickCount();
            break;
          }
        }
      }

      // 3) if still none, find the oldest open tunnel, close it and reuse
      if (useIndex == -1) {
        int oldestIndex = 0;
        unsigned long oldestTime = tunnels[0].openedAt;
        for (int i = 1; i < Fridgecloud::TUNNEL_COUNT; ++i) {
          if (tunnels[i].openedAt < oldestTime) {
            oldestTime = tunnels[i].openedAt;
            oldestIndex = i;
          }
        }
        tunnels[oldestIndex].client.stop();
        handleTunnelCloses();

        useIndex = oldestIndex;
        tunnels[useIndex].connectionId = incomingId;
        tunnels[useIndex].sequence = 0;
        tunnels[useIndex].openedAt = xTaskGetTickCount();
      }

      auto &tunnel = tunnels[useIndex];

      if (!tunnel.client.connected()) {
        // ensure host pointer is stable and port uses full 16-bit range
        const char* host = doc["host"].as<const char*>();
        uint16_t port = static_cast<uint16_t>(doc["port"].as<int>());
        if (!tunnel.client.connect(host, port)) {
          return;
        }
        tunnel.client.setTimeout(50);
        tunnel.openedAt = xTaskGetTickCount();
      }

      if (tunnel.client.connected()) {
        // decode into a vector and write all bytes at once
        std::vector<uint8_t> decoded = base64::decode(doc["payload"].as<std::string>());
        if (!decoded.empty()) {
          tunnel.client.write(reinterpret_cast<const uint8_t*>(decoded.data()), decoded.size());
        }
      }
    });

    client->subscribe(topic_alarms.c_str(), [&](const String & topic, const String & payload) {
      auto doc = std::make_unique<DynamicJsonDocument>(8192);
      DeserializationError error = deserializeJson(*doc, payload);
      if (error) {
        Serial.println("error parsing alarms config");
        return;
      }
      alarm_config = std::move(doc);

      // Remove state only for alarms that are no longer in the new config,
      // so in-progress trigger/cooldown tracking is preserved for existing alarms.
      std::vector<std::string> newIds;
      for (JsonObjectConst a : alarm_config->as<JsonArrayConst>()) {
        const char* id = a["alarmId"];
        if (id) newIds.push_back(id);
      }
      for (auto it = alarm_states.begin(); it != alarm_states.end(); ) {
        if (std::find(newIds.begin(), newIds.end(), it->first) == newIds.end()) {
          it = alarm_states.erase(it);
        } else {
          ++it;
        }
      }
      Serial.println("alarm config updated");
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
      handleTunnelCloses();
      handleTunnelReads();

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

  bool Fridgecloud::updateStatus(DynamicJsonDocument status) {
    checkAlarms(status);

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

        return true;
      }
      return false;
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
      return true;
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


  void Fridgecloud::executeWebhook(const JsonDocument& command) {
    const char* url = command["url"].as<const char*>();
    const char* method = command["method"].as<const char*>();
    const char* payload = command["payload"].as<const char*>();

    if (!url || strlen(url) == 0) {
      Serial.println("executeWebhook: no URL provided");
      return;
    }

    HTTPClient http;
    http.begin(url);

    String methodStr = method ? method : "POST";

    if (methodStr != "GET") {
      http.addHeader("Content-Type", "application/json");
    }

    JsonObjectConst headers = command["headers"].as<JsonObjectConst>();
    for (JsonPairConst kv : headers) {
      http.addHeader(kv.key().c_str(), kv.value().as<const char*>());
    }

    int httpCode = -1;

    if (methodStr == "GET") {
      httpCode = http.GET();
    } else if (methodStr == "POST") {
      httpCode = http.POST(payload ? payload : "");
    } else {
      httpCode = http.sendRequest(methodStr.c_str(), payload ? payload : "");
    }

    Serial.printf("Webhook executed: %s %s -> %d\n", methodStr.c_str(), url, httpCode);
    http.end();
  }

  static float getSensorValueFromStatus(const DynamicJsonDocument& status, const char* sensorType) {
    JsonVariantConst v;
    if (strcmp(sensorType, "temperature") == 0)      v = status["sensors"]["temperature"];
    else if (strcmp(sensorType, "humidity") == 0)    v = status["sensors"]["humidity"];
    else if (strcmp(sensorType, "co2") == 0)         v = status["sensors"]["co2"];
    else if (strcmp(sensorType, "co2_valve") == 0)   v = status["outputs"]["co2"];
    else if (strcmp(sensorType, "dehumidifier") == 0) v = status["outputs"]["dehumidifier"];
    else if (strcmp(sensorType, "fan") == 0)         v = status["outputs"]["fan"];
    else if (strcmp(sensorType, "heater") == 0) {
      JsonVariantConst h = status["outputs"]["heater"];
      return h.isNull() ? NAN : h.as<float>() * 100.0f;
    }
    else if (strcmp(sensorType, "light") == 0)       v = status["outputs"]["light"];
    else return NAN;
    return v.isNull() ? NAN : v.as<float>();
  }

  static bool isAlarmThresholdExceeded(JsonObjectConst alarm, float sensorValue) {
    const char* sensorType = alarm["sensorType"];
    if (strcmp(sensorType, "dehumidifier") == 0 || strcmp(sensorType, "co2_valve") == 0) {
      return sensorValue > 0;
    }
    JsonVariantConst upper = alarm["upperThreshold"];
    JsonVariantConst lower = alarm["lowerThreshold"];
    if (!upper.isNull() && sensorValue > upper.as<float>()) return true;
    if (!lower.isNull() && sensorValue < lower.as<float>()) return true;
    return false;
  }

  void Fridgecloud::checkAlarms(const DynamicJsonDocument& status) {
    if (!alarm_config) return;

    JsonArrayConst alarms = alarm_config->as<JsonArrayConst>();
    if (alarms.isNull()) return;

    for (JsonObjectConst alarm : alarms) {
      const char* alarmId = alarm["alarmId"];
      const char* sensorType = alarm["sensorType"];
      if (!alarmId || !sensorType) continue;

      float sensorValue = getSensorValueFromStatus(status, sensorType);
      if (std::isnan(sensorValue)) continue;

      bool exceeded = isAlarmThresholdExceeded(alarm, sensorValue);

      std::string id(alarmId);
      AlarmState& state = alarm_states[id];

      if (exceeded && !state.triggered) {
        unsigned long cooldownMs = (unsigned long)((float)(alarm["cooldownSeconds"] | 0) * 1000.0f);
        unsigned long now = millis();
        if (cooldownMs > 0 && (now - state.lastTriggeredMillis) < cooldownMs) continue;

        state.triggered = true;
        state.lastTriggeredMillis = now;
        fireAlarmWebhook(alarm, sensorValue, true);
      } else if (!exceeded && state.triggered) {
        state.triggered = false;
        fireAlarmWebhook(alarm, sensorValue, false);
      }
    }
  }

  void Fridgecloud::fireAlarmWebhook(JsonObjectConst alarm, float sensorValue, bool triggered) {
    const char* rawTarget = alarm["actionTarget"];
    if (!rawTarget || strlen(rawTarget) == 0) return;

    std::string url(rawTarget);
    auto pipe = url.find('|');
    if (pipe != std::string::npos) {
      url = triggered ? url.substr(0, pipe) : url.substr(pipe + 1);
      size_t start = url.find_first_not_of(' ');
      size_t end   = url.find_last_not_of(' ');
      url = (start == std::string::npos) ? "" : url.substr(start, end - start + 1);
    }
    if (url.empty()) return;

    const char* customPayload = triggered
      ? alarm["webhookTriggeredPayload"].as<const char*>()
      : alarm["webhookResolvedPayload"].as<const char*>();

    String payloadStr;
    if (!customPayload || strlen(customPayload) == 0) {
      DynamicJsonDocument payloadDoc(1024);
      payloadDoc["deviceId"]   = device_id.c_str();
      payloadDoc["sensorType"] = alarm["sensorType"];
      payloadDoc["value"]      = sensorValue;
      if (!alarm["upperThreshold"].isNull()) payloadDoc["upperThreshold"] = alarm["upperThreshold"];
      if (!alarm["lowerThreshold"].isNull()) payloadDoc["lowerThreshold"] = alarm["lowerThreshold"];
      payloadDoc["event"]      = triggered ? "triggered" : "resolved";
      payloadDoc["alarmName"]  = alarm["name"];
      payloadDoc["alarmId"]    = alarm["alarmId"];
      unsigned long t = (unsigned long)getTime();
      if (t > 1000000000UL) payloadDoc["timestamp"] = t;
      serializeJson(payloadDoc, payloadStr);
    } else {
      payloadStr = customPayload;
    }

    DynamicJsonDocument cmd(4096);
    cmd["url"]     = url.c_str();
    cmd["method"]  = alarm["webhookMethod"] | "POST";
    cmd["payload"] = payloadStr;
    cmd["headers"].to<JsonObject>();
    JsonObjectConst headers = alarm["webhookHeaders"].as<JsonObjectConst>();
    if (!headers.isNull()) {
      for (JsonPairConst kv : headers) {
        cmd["headers"][kv.key().c_str()] = kv.value();
      }
    }

    executeWebhook(cmd);
  }

  void Fridgecloud::handleTunnelCloses() {
    if (!ui.isIdle()) {
      return;
    }

    for (int i = 0; i < Fridgecloud::TUNNEL_COUNT; ++i) {
        auto &t = tunnels[i];
        if (!t.client.connected() && t.openedAt > 0) {
          t.openedAt = 0;
          StaticJsonDocument<1024> message_json;
          message_json["connection_id"] = t.connectionId.c_str();
          message_json["sequence"] = t.sequence++;
          message_json["disconnected"] = true;

          std::stringstream stream;
          serializeJson(message_json, stream);

          client->publish(topic_tunnel_read.c_str(), stream.str().c_str());
        }
    }
  }

  void Fridgecloud::handleTunnelReads() {
    if (!ui.isIdle()) {
      return;
    }

    int packetCount = 0;
    for (int i = 0; i < Fridgecloud::TUNNEL_COUNT; ++i) {
        auto &t = tunnels[i];
        if (t.client.connected()) {
          char buffer[TUNNEL_PAYLOAD_LEN];
          size_t len = 0;
          while (t.client.available() && packetCount <= TUNNEL_PACKET_PER_LOOP_COUNT) {
            int c = t.client.read();
            buffer[len++] = static_cast<char>(c);

            if (len >= TUNNEL_PAYLOAD_LEN - 1 || (!t.client.available() && len > 0)) {
              std::string payloadEncoded = base64::encode(reinterpret_cast<const uint8_t*>(buffer), len);

              StaticJsonDocument<1024> message_json;
              message_json["connection_id"] = t.connectionId.c_str();
              message_json["length"] = static_cast<int>(len);
              message_json["sequence"] = t.sequence++;
              message_json["payload"] = payloadEncoded.c_str();

              std::stringstream stream;
              serializeJson(message_json, stream);

              if (!client->publish(topic_tunnel_read.c_str(), stream.str().c_str())) {
                t.client.stop();
                break;
              }

              packetCount++;
              len = 0;
            }
          }
        }
      }
  }
}

