#!/usr/bin/env /bin/bash

source .env

docker build -t plantalytix-buildcontainer fw-buildcontainer

docker run -it \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v $(pwd)/firmware:/firmware \
  -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
  -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
  -e FG_API_URL=${API_URL_EXTERNAL} \
  -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
  -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
  plantalytix-buildcontainer sh -c "cd /firmware; ./dev-build.sh plug"

docker run -it \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v $(pwd)/firmware:/firmware \
  -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
  -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
  -e FG_API_URL=${API_URL_EXTERNAL} \
  -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
  -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
  plantalytix-buildcontainer sh -c "cd /firmware; ./dev-build.sh fan"

docker run -it \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v $(pwd)/firmware:/firmware \
  -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
  -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
  -e FG_API_URL=${API_URL_EXTERNAL} \
  -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
  -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
  plantalytix-buildcontainer sh -c "cd /firmware; ./dev-build.sh light"

docker run -it \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v $(pwd)/firmware:/firmware \
  -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
  -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
  -e FG_API_URL=${API_URL_EXTERNAL} \
  -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
  -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
  plantalytix-buildcontainer sh -c "cd /firmware; ./dev-build.sh fridge"