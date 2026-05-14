#!/bin/sh
set -eu

CONF=/etc/rabbitmq/conf.d/rabbitmq.conf

if [ -z "${MQTTAUTH_SHARED_SECRET:-}" ]; then
  echo "FATAL: MQTTAUTH_SHARED_SECRET is not set; refusing to start rabbitmq." >&2
  exit 1
fi

escaped=$(printf '%s' "$MQTTAUTH_SHARED_SECRET" | sed -e 's/[\\|&]/\\&/g')
sed -i "s|@MQTTAUTH_SHARED_SECRET@|${escaped}|g" "$CONF"

exec docker-entrypoint.sh "$@"

