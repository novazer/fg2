#!/usr/bin/env bash

cd scripts; 
python3 html-compress.py; 
cd ..; 
platformio run
curl -F 'update=@.pio/build/heltec_wifi_lora_32_V2/firmware.bin' http://10.100.10.163/update
