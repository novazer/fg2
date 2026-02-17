#!/bin/bash
set -e

if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -v CUSTOM_LINKS_HTML | xargs)
fi

docker build -t plantalytix-buildcontainer fw-buildcontainer

# copy firmware to docker volume (for mac os/windows compatibility)
docker rm -f fw-temp-container 2>/dev/null 1>&2 || true
docker volume rm -f fg2_firmware 2>/dev/null 1>&2 || true
docker run -d --name fw-temp-container -v fg2_firmware:/firmware -e API_URL_EXTERNAL=${API_URL_EXTERNAL} debian sleep 3600
docker cp ./firmware/. fw-temp-container:/firmware
docker exec -i fw-temp-container cp /firmware/src/wifi.cpp /firmware/src/wifi.cpp.tmpl
docker exec -i fw-temp-container sh -c 'perl -p -e '"'"'s/#API_URL_EXTERNAL#/$ENV{API_URL_EXTERNAL}/g'"'"' /firmware/src/wifi.cpp.tmpl > /firmware/src/wifi.cpp'
docker exec -i fw-temp-container rm /firmware/src/wifi.cpp.tmpl
docker rm -f fw-temp-container 2>/dev/null 1>&2 || true

HARDWARES=$@
if [ -z "$HARDWARES" ]; then
  HARDWARES="fridge controller plug fan light"
fi

for hardware in $HARDWARES; do
  echo "Building firmware for ${hardware}..."
  docker run -i --rm \
    -v fg2_firmware:/firmware \
    -e FG_AUTOMATION_TOKEN=${AUTOMATION_TOKEN} \
    -e FG_AUTOMATION_URL=${API_URL_EXTERNAL} \
    -e FG_API_URL=${API_URL_EXTERNAL} \
    -e FG_MQTT_HOST=${MQTT_HOST_EXTERNAL} \
    -e FG_MQTT_PORT=${MQTT_PORT_EXTERNAL} \
    -e FW_UPLOAD_VERSION="${FW_UPLOAD_VERSION}" \
    -e FW_NO_UPLOAD=${FW_NO_UPLOAD} \
    -e FW_VERSION_ID=${FW_VERSION_ID} \
    plantalytix-buildcontainer sh -c "cd /firmware; ./dev-build.sh $hardware"
done

docker volume rm -f fg2_firmware 2>/dev/null 1>&2 || true