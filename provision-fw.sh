#!/bin/bash
set -e

DEVICE_TYPE="$1"
if [ -z "$DEVICE_TYPE" ]; then
    echo "Usage: $0 <device-type>"
    echo "Device types: plug, light, fan, fridge"
    exit 1
fi

if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v CUSTOM_LINKS_HTML | xargs)
fi

docker build -t plantalytix-buildcontainer fw-buildcontainer

# copy firmware to docker volume (for mac os/windows compatibility)
docker rm -f fw-temp-container || true
docker run -d --name fw-temp-container -v fg2_firmware:/firmware -e API_URL_EXTERNAL=${API_URL_EXTERNAL} debian sleep 3600
docker cp ./firmware/. fw-temp-container:/firmware
docker exec -i fw-temp-container cp /firmware/src/wifi.cpp /firmware/src/wifi.cpp.tmpl
docker exec -i fw-temp-container sh -c 'perl -p -e '"'"'s/#API_URL_EXTERNAL#/$ENV{API_URL_EXTERNAL}/g'"'"' /firmware/src/wifi.cpp.tmpl > /firmware/src/wifi.cpp'
docker exec -i fw-temp-container rm /firmware/src/wifi.cpp.tmpl
docker rm -f fw-temp-container

docker run -i --rm \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v fg2_firmware:/firmware \
  -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
  -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
  -e FG_API_URL=${API_URL_EXTERNAL} \
  -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
  -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
  plantalytix-buildcontainer sh -c "cd /firmware; ./dev-provision.sh \"$DEVICE_TYPE\""

docker volume rm fg2_firmware