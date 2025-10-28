#!/usr/bin/env bash

docker pull microgreenbox/pio-build:latest

docker run -it \
  --privileged \
  --device=/dev/ttyUSB0 \
  -v /dev/bus/usb:/dev/bus/usb \
  -e FG_AUTOMATION_TOKEN=df704228-0330-4904-9bce-55df8a7c8182 \
  -e FG_AUTOMATION_URL=https://api.plantalytix-app-beta.com \
  -e FG_API_URL=https://api.plantalytix-app-beta.com \
  -e FG_MQTT_HOST=142.132.245.68 \
  -e FG_MQTT_PORT=1883 \
  -v $(pwd):/app \
  -w /app \
  microgreenbox/pio-build:latest pio run --target upload -e fridge