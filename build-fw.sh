#!/bin/bash
set -e

if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

docker build -t plantalytix-buildcontainer fw-buildcontainer

# copy firmware to docker volume (for mac os/windows compatibility)
docker container create --name fw-temp-container -v fg2_firmware:/firmware busybox
docker cp ./firmware/. fw-temp-container:/firmware
docker rm fw-temp-container

docker run -i --rm \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v fg2_firmware:/firmware \
  -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
  -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
  -e FG_API_URL=${API_URL_EXTERNAL} \
  -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
  -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
  -e FW_UPLOAD_VERSION=${FW_UPLOAD_VERSION} \
  -e FW_NO_UPLOAD=${FW_NO_UPLOAD} \
  -e FW_VERSION_ID=${FW_VERSION_ID} \
  plantalytix-buildcontainer sh -c "cd /firmware; ./dev-build.sh plug"

docker run -i --rm \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v fg2_firmware:/firmware \
  -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
  -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
  -e FG_API_URL=${API_URL_EXTERNAL} \
  -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
  -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
  -e FW_UPLOAD_VERSION=${FW_UPLOAD_VERSION} \
  -e FW_NO_UPLOAD=${FW_NO_UPLOAD} \
  -e FW_VERSION_ID=${FW_VERSION_ID} \
  plantalytix-buildcontainer sh -c "cd /firmware; ./dev-build.sh fan"

docker run -i --rm \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v fg2_firmware:/firmware \
  -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
  -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
  -e FG_API_URL=${API_URL_EXTERNAL} \
  -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
  -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
  -e FW_UPLOAD_VERSION=${FW_UPLOAD_VERSION} \
  -e FW_NO_UPLOAD=${FW_NO_UPLOAD} \
  -e FW_VERSION_ID=${FW_VERSION_ID} \
  plantalytix-buildcontainer sh -c "cd /firmware; ./dev-build.sh light"

docker run -i --rm \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v fg2_firmware:/firmware \
  -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
  -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
  -e FG_API_URL=${API_URL_EXTERNAL} \
  -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
  -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
  -e FW_UPLOAD_VERSION=${FW_UPLOAD_VERSION} \
  -e FW_NO_UPLOAD=${FW_NO_UPLOAD} \
  -e FW_VERSION_ID=${FW_VERSION_ID} \
  plantalytix-buildcontainer sh -c "cd /firmware; ./dev-build.sh fridge"

docker volume rm fg2_firmware