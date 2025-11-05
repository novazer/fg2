#!/bin/bash
set -ex

export BUILD_TYPE=${1}

if [ -z "$FW_VERSION_ID" ]; then
  export FW_VERSION_ID=$(fgcli.py create-fw ${BUILD_TYPE} ${FW_UPLOAD_VERSION:-0.0.0})
fi

export PLATFORMIO_BUILD_FLAGS="-DDEVELOPMENT_BUILD"

export MQTT_HOST=${FG_MQTT_HOST}
export MQTT_PORT=${FG_MQTT_PORT}
export API_URL=${FG_API_URL}

if [ -z "$FW_VERSION_ID" ]
then
  echo "failed to get version id";
  exit 1;
fi

pio run -e ${BUILD_TYPE}
echo ${FW_VERSION_ID}

if [ -z "$FW_NO_UPLOAD" ]; then
  fgcli.py upload-fw ${FW_VERSION_ID} firmware.bin .pio/build/${BUILD_TYPE}/firmware.bin
  fgcli.py upload-fw ${FW_VERSION_ID} bootloader.bin .pio/build/${BUILD_TYPE}/bootloader.bin
  fgcli.py upload-fw ${FW_VERSION_ID} partitions.bin .pio/build/${BUILD_TYPE}/partitions.bin
  fgcli.py upload-fw ${FW_VERSION_ID} boot_app0.bin ~/.platformio/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin

  if [ -z "$FW_UPLOAD_VERSION" ]; then
    fgcli.py rollout-id ${FW_VERSION_ID} ${BUILD_TYPE}
  fi
fi