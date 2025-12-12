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
elif [ -f ../.env ]; then
    export $(grep -v '^#' ../.env | grep -v CUSTOM_LINKS_HTML | xargs)
fi

if [ -z "$FG_AUTOMATION_TOKEN" ]; then
  export FG_AUTOMATION_TOKEN="$AUTOMATION_TOKEN"
fi
if [ -z "$FG_AUTOMATION_URL" ]; then
  export FG_AUTOMATION_URL="$API_URL_EXTERNAL"
fi
if [ -z "$FG_API_URL" ]; then
  export FG_API_URL="$API_URL_EXTERNAL"
fi
if [ -z "$FG_MQTT_HOST" ]; then
  export FG_MQTT_HOST="$MQTT_HOST_EXTERNAL"
fi
if [ -z "$FG_MQTT_PORT" ]; then
  export FG_MQTT_PORT="$MQTT_PORT_EXTERNAL"
fi

fgcli.py provision "$DEVICE_TYPE" "$DEVICE_TYPE"