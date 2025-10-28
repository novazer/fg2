#include <Ticker.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
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

  esp_task_wdt_init(25, true); //enable panic so ESP32 restarts
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
  try {
    static TickType_t last_controll_tick = 0;
    static TickType_t last_ui_tick = 0;
    if((xTaskGetTickCount() - last_controll_tick) > CONTROL_TICK_INTERVAL) {
      last_controll_tick = xTaskGetTickCount();

      control->loop();
    }

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

    control->fastloop();

    wifiTick();
    if(wifiIsConnected()) {
      fgc.loop();
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
  catch(...) {
    Serial.println("EXCEPTION DURING LOOP!!!");
  }
}
