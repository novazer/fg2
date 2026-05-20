#include <Ticker.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <esp_system.h>
#include <WiFi.h>
#include <exception>
#include "soc/rtc_wdt.h"
#include <sstream>

#include "Wire.h"
#include "fridgecloud.h"
#include "wifi.h"
#include "automation.h"

#include "observeable.h"
#include "ui.h"

#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

#include "fghmi.h"

void automationTick();

std::unique_ptr<fg::AutomationController> control;
fg::UserInterface ui;
fg::Fridgecloud fgc(ui);

// Returns a short human-readable string for esp_reset_reason() so we can log
// *why* the device rebooted (panic, task-watchdog, brownout, ...). Knowing the
// cause is critical when debugging field reboots on devices with bad uplinks.
static const char* resetReasonStr(esp_reset_reason_t r) {
  switch(r) {
    case ESP_RST_POWERON:   return "POWERON";
    case ESP_RST_EXT:       return "EXT";
    case ESP_RST_SW:        return "SW";
    case ESP_RST_PANIC:     return "PANIC";
    case ESP_RST_INT_WDT:   return "INT_WDT";
    case ESP_RST_TASK_WDT:  return "TASK_WDT";
    case ESP_RST_WDT:       return "WDT";
    case ESP_RST_DEEPSLEEP: return "DEEPSLEEP";
    case ESP_RST_BROWNOUT:  return "BROWNOUT";
    case ESP_RST_SDIO:      return "SDIO";
    default:                return "UNKNOWN";
  }
}

// Last reset reason captured during setup() so we can publish it as part of
// the health log once MQTT is up.
static esp_reset_reason_t g_last_reset_reason = ESP_RST_UNKNOWN;

// Survives a software reset (ESP.restart()) but is cleared on power-on.
// Set to true just before a connection-watchdog reboot so the next boot
// knows not to reboot again if the outage is still ongoing (prevents the
// device from rebooting in a loop when the broker / internet is just down).
// Cleared when MQTT actually connects (re-arms the watchdog) or when the
// reset reason is not ESP_RST_SW (WDT, panic, brownout, power-on).
RTC_DATA_ATTR static bool g_connection_reboot = false;

// Per-phase exception accounting. The previous bare catch(...) in loop()
// swallowed *every* C++ exception with no clue about origin, type, or
// system state. When a single phase starts throwing every tick (typical
// symptom: std::bad_alloc from a JSON / std::stringstream allocation under
// heap pressure) we want to know:
//   - WHICH phase is throwing
//   - WHAT type / message
//   - what the heap looks like at the moment of the throw
// without filling the serial port with thousands of identical lines per
// second. So we count occurrences per phase and emit a diagnostic line
// only on the first occurrence and then every Nth occurrence afterwards.
struct PhaseStats {
  const char* name;
  uint32_t count;
};

static PhaseStats g_phase_stats[] = {
  { "control.loop", 0 },
  { "control.fastloop", 0 },
  { "wifi.tick", 0 },
  { "fgc.loop", 0 },
};

static void reportException(PhaseStats& phase, const char* what) {
  ++phase.count;
  // Print on first occurrence and then logarithmically (every 1, 2, 4, 8,
  // 16, ... occurrences) so a sustained per-tick throw produces a manageable
  // amount of output but we never miss the very first instance.
  bool should_log = phase.count == 1 ||
                    (phase.count & (phase.count - 1)) == 0;
  if(!should_log) {
    return;
  }
  Serial.printf("[exc] phase=%s n=%u what=%s free=%u largest=%u min_free=%u\n",
                phase.name,
                (unsigned)phase.count,
                what ? what : "<unknown>",
                (unsigned)ESP.getFreeHeap(),
                (unsigned)ESP.getMaxAllocHeap(),
                (unsigned)ESP.getMinFreeHeap());
}

// Run a phase callable, isolating it from the rest of the loop so one
// failing subsystem cannot poison the others, and surface diagnostics that
// the bare catch(...) used to throw away.
template<typename F>
static void runPhase(PhaseStats& phase, F&& fn) {
  try {
    fn();
  }
  catch(const std::exception& e) {
    reportException(phase, e.what());
  }
  catch(...) {
    reportException(phase, "non-std exception");
  }
}

#define ROTA 27
#define ROTB 14
#define BTN 25

// #define ROTA 18
// #define ROTB 19
// #define BTN 5

#define HOLD_TIMEOUT 1000

static constexpr TickType_t CONTROL_TICK_INTERVAL = 1 * configTICK_RATE_HZ;
static constexpr TickType_t UI_TICK_INTERVAL = configTICK_RATE_HZ / 10;


void IRAM_ATTR isr() {
  int rota = digitalRead(ROTA);
  int rotb = digitalRead(ROTB);

  if(rotb) {
    if(rota) {
      ui.next();
    }
    else {
      ui.prev();
    }
  }
}

// Robust Rotary encoder reading
//
// Copyright John Main - best-microcontroller-projects.com
//
#define CLK 2
#define DATA 7

static uint8_t prevNextCode = 0;
static uint16_t store=0;


// A vald CW or  CCW move returns 1, invalid returns 0.
int8_t read_rotary() {
  static int8_t rot_enc_table[] = {0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0};

  prevNextCode <<= 2;
  if (digitalRead(ROTB)) prevNextCode |= 0x02;
  if (digitalRead(ROTA)) prevNextCode |= 0x01;
  prevNextCode &= 0x0f;

   // If valid then store as 16 bit data.
   if  (rot_enc_table[prevNextCode] ) {
      store <<= 4;
      store |= prevNextCode;
      //if (store==0xd42b) return 1;
      //if (store==0xe817) return -1;
      if ((store&0xff)==0x2b) return -1;
      if ((store&0xff)==0x17) return 1;
   }
   return 0;
}

static TimerHandle_t hold_timer = NULL;
static TickType_t ui_action_delay = 0;
static bool btn_down = false;

void holdTimeout(void* unused) {
  hold_timer = NULL;
  ui.hold();
}

void IRAM_ATTR isr2() {
  if(ui_action_delay < xTaskGetTickCount()) {
    auto btn = digitalRead(BTN);
    if(btn == 0 && !btn_down) {
      if(!hold_timer) {
        hold_timer = xTimerCreate("", HOLD_TIMEOUT, false, 0, &holdTimeout);
        xTimerStart(hold_timer, 0);
        btn_down = true;
      }
    }

    else if(btn == 1 && btn_down) {
      if(hold_timer) {
        xTimerDelete(hold_timer, 0);
        hold_timer = NULL;
        ui.enter();
        ui_action_delay = xTaskGetTickCount() + 10;
        btn_down = false;
      }
      if(btn_down) {
        ui_action_delay = xTaskGetTickCount() + 10;
        btn_down = false;
      }
    }
  }
}



void setup()
{
  using namespace fg;

  //Wire.setTimeout(10);

  Serial.begin(115200);
  while (!Serial);

  // Capture and print the reason for the previous reboot. This is the single
  // most useful piece of diagnostic information when chasing field reboots:
  // TASK_WDT means a stuck loop, PANIC means a crash/abort, BROWNOUT means
  // a power-supply dip (very common on devices with a bad uplink where the
  // radio TX power spikes draw current the supply can't deliver), POWERON
  // means the device actually lost power.
  g_last_reset_reason = esp_reset_reason();
  // Only keep the "no-reboot-yet" flag across our own soft resets.
  // Any other reset type (WDT, panic, brownout, power-on) should re-arm
  // the watchdog so the device can recover from future connection problems.
  if(g_last_reset_reason != ESP_RST_SW) {
    g_connection_reboot = false;
  }
  Serial.printf("[boot] reset_reason=%s (%d)\n", resetReasonStr(g_last_reset_reason),
                (int)g_last_reset_reason);
  Serial.printf("[boot] heap free=%u largest_block=%u min_free=%u\n",
                (unsigned)ESP.getFreeHeap(),
                (unsigned)ESP.getMaxAllocHeap(),
                (unsigned)ESP.getMinFreeHeap());


  control = createController(fgc);
  control->init();

  ui.init();

  control->initStatusMenu(&ui);

  initializeWifi();
  fgc.init();
  fgc.connect();

  pinMode(ROTA, INPUT_PULLUP);
  pinMode(ROTB, INPUT_PULLUP);
  pinMode(BTN, INPUT_PULLUP);

  attachInterrupt(BTN, isr2, CHANGE);

  // Task watchdog. The 25s value used previously was too tight: on
  // Arduino-ESP32 the WiFiClient::write() retry loop is hardcoded to up to
  // 10 * 1s (WIFI_CLIENT_MAX_WRITE_RETRY) when the LWIP send buffer is
  // full, and one MQTT publish issues several writes. The TCP-connect path
  // (PubSubClient/HTTPClient) can also block for several seconds. Sizing
  // the WDT at 60s gives ~2x headroom over the worst-case bounded blocking
  // calls while still catching genuine hangs.
  esp_task_wdt_init(60, true); //enable panic so ESP32 restarts
  esp_task_wdt_add(NULL); //add current thread to WDT watch


}

// This function is called once everything is connected (Wifi and MQTT)
// WARNING : YOU MUST IMPLEMENT IT IF YOU USE EspMQTTClient
void onConnectionEstablished()
{
  Serial.println("onConnectionEstablished");
}

void loop()
{
  static TickType_t last_controll_tick = 0;
  static TickType_t last_ui_tick = 0;
  static TickType_t last_health_tick = 0;
  static bool last_wifi_connected = wifiIsConnected();

  bool wifi_connected = wifiIsConnected();
  if(wifi_connected != last_wifi_connected) {
    Serial.printf("[wifi] state changed: %s\n", wifi_connected ? "connected" : "disconnected");
    fgc.resetConnection();
    last_wifi_connected = wifi_connected;
  }

  static constexpr TickType_t HEALTH_TICK_INTERVAL = 60 * configTICK_RATE_HZ;
  static constexpr uint32_t LOW_LARGEST_BLOCK_THRESHOLD = 25000;
  static constexpr uint32_t LOW_FREE_HEAP_THRESHOLD = 42000;
  static constexpr uint32_t LOW_HEAP_RESTART_TICKS = 3;
  static uint32_t low_heap_ticks = 0;
  if((xTaskGetTickCount() - last_health_tick) > HEALTH_TICK_INTERVAL) {
    last_health_tick = xTaskGetTickCount();
    int8_t rssi = WiFi.isConnected() ? WiFi.RSSI() : 0;
    uint32_t free = ESP.getFreeHeap();
    uint32_t largest = ESP.getMaxAllocHeap();
    Serial.printf("[health] uptime=%lus free=%u largest=%u min_free=%u rssi=%d reset=%s exc[cl=%u cfl=%u wt=%u fl=%u]\n",
                  (unsigned long)(millis() / 1000),
                  (unsigned)free,
                  (unsigned)largest,
                  (unsigned)ESP.getMinFreeHeap(),
                  (int)rssi,
                  resetReasonStr(g_last_reset_reason),
                  (unsigned)g_phase_stats[0].count,
                  (unsigned)g_phase_stats[1].count,
                  (unsigned)g_phase_stats[2].count,
                  (unsigned)g_phase_stats[3].count);

    if(free < LOW_FREE_HEAP_THRESHOLD || largest < LOW_LARGEST_BLOCK_THRESHOLD) {
      ++low_heap_ticks;
      Serial.printf("[health] low heap streak=%u/%u\n",
                    (unsigned)low_heap_ticks,
                    (unsigned)LOW_HEAP_RESTART_TICKS);
      if(low_heap_ticks >= LOW_HEAP_RESTART_TICKS) {
        Serial.println("[health] sustained low heap, restarting to recover");
        Serial.flush();
        ESP.restart();
      }
    }
    else {
      low_heap_ticks = 0;
    }
  }

  if((xTaskGetTickCount() - last_controll_tick) > CONTROL_TICK_INTERVAL) {
    last_controll_tick = xTaskGetTickCount();
    runPhase(g_phase_stats[0], []{ control->loop(); });
  }

  // Rotary input runs every iteration. Kept outside runPhase: the read is
  // a single GPIO sample and cannot throw, and we don't want a UI/encoder
  // bug to be silently swallowed.
  static int8_t c,val;
  if( val=read_rotary() ) {
    if(val == -1) {
      ui.prev();
    }
    else {
      ui.next();
    }
  }

  if((xTaskGetTickCount() - last_ui_tick) > UI_TICK_INTERVAL) {
    last_ui_tick = xTaskGetTickCount();
    ui.loop();
    ui.cleanup();
    //updateWifiUi(&ui);
  }

  runPhase(g_phase_stats[1], []{ control->fastloop(); });
  runPhase(g_phase_stats[2], []{ wifiTick(); });
  runPhase(g_phase_stats[3], []{ fgc.loop(); });

  // Connection watchdog: reboot once if the cloud has been unreachable for
  // 15 min. g_connection_reboot prevents a reboot-loop if the outage persists
  // after the reboot; it is cleared when MQTT actually reconnects.
  {
    static constexpr TickType_t CONNECTION_WATCHDOG_TICKS = 15UL * 60 * configTICK_RATE_HZ;
    static TickType_t last_connected_tick = xTaskGetTickCount();
    if(fgc.isConnected()) {
      last_connected_tick = xTaskGetTickCount();
      g_connection_reboot = false;
    }
    if(!g_connection_reboot && (xTaskGetTickCount() - last_connected_tick) > CONNECTION_WATCHDOG_TICKS) {
      Serial.println("[watchdog] no cloud connection for 15 min, rebooting");
      Serial.flush();
      g_connection_reboot = true;
      ESP.restart();
    }
  }

  esp_task_wdt_reset();

  if(Serial.available()) {
    if(Serial.read() == 'r') {
      // Serial.println("factory reset");
      // resetCredentials();
      ESP.restart();
    }
  }
}
