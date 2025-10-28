#pragma once

#include <memory>
#include <queue>
#include <EspMQTTClient.h>
#include <HTTPClient.h>

#include "fghmi.h"
#include "settings.h"
#include "observeable.h"
#include "ArduinoJson.h"

#define NVS_PART "nvs_ro"

#define UUID_LEN 128

namespace fg {

  class Fridgecloud {

    static constexpr unsigned int MAX_BUFFER_LEN = 120;
    static constexpr unsigned int SAMPLE_INTERVAL = 5;
    static constexpr unsigned int UPLOAD_INTERVAL = 1;

    std::unique_ptr<EspMQTTClient> client;
    std::queue<std::pair<std::string, unsigned int>> log_queue;

    String topic_configuration;
    String topic_fetch;
    String topic_status;
    String topic_bulk;
    String topic_log;
    String topic_firmware;
    String topic_fwupdate;
    String topic_command;
    String topic_control;


    std::string device_id;
    std::string mqtt_user;
    std::string mqtt_password;
    std::string mqtt_host;
    std::string mqtt_port;
    std::string api_url;

    Subject<const String &> config_subject;
    Subject<JsonDocument> command_subject;
    Subject<bool> update_subject;
    Subject<std::pair<std::string,std::string>> control_subject;

    bool custom_mqtt = false;

    std::vector<std::string> status_buffer;

    UserInterface& ui;

    bool connected = false;
    unsigned int current_sample = 0;

  public:
    Fridgecloud(UserInterface& ui) : ui(ui) {}

    template<class F> void onConfig(F&& callback) {
      config_subject.subscribe(callback);
    }

    template<class F> void onCommand(F&& callback) {
      command_subject.subscribe(callback);
    }

    template<class F> void onUpdate(F&& callback) {
      update_subject.subscribe(callback);
    }

    template<class F> void onControl(F&& callback) {
      control_subject.subscribe(callback);
    }

    std::string requestPairingCode();
    void init();
    void connect();
    void updateStatus(DynamicJsonDocument status);
    void uploadStatus();
    void updateConfig(const char* data);
    void log(std::string message, unsigned int severity = 0);
    void loop();
    void updateFirmware(std::string fw_id);
    void updateFirmwareFromUrl(std::string update_url);
    bool registerWithCloud(std::string url, std::string password);
    inline bool directMode() { return custom_mqtt; }
  };

}

