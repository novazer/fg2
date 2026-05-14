#!/bin/sh
set -eu

CONF=/etc/rabbitmq/conf.d/rabbitmq.conf

if [ -z "${MQTTAUTH_SHARED_SECRET:-}" ]; then
  echo "FATAL: MQTTAUTH_SHARED_SECRET is not set; refusing to start rabbitmq." >&2
  exit 1
fi

# The secret is interpolated into a URL path segment (see rabbitmq.conf, C4),
# so we URL-encode every non-unreserved character. Express's :secret param
# will URL-decode it back to the original value before the auth middleware
# does its constant-time compare.
encoded=$(printf '%s' "$MQTTAUTH_SHARED_SECRET" | awk '
  BEGIN { for (i = 0; i < 256; i++) hex[sprintf("%c", i)] = sprintf("%%%02X", i) }
  {
    for (i = 1; i <= length($0); i++) {
      c = substr($0, i, 1)
      if (c ~ /[A-Za-z0-9._~-]/) printf "%s", c
      else printf "%s", hex[c]
    }
  }')

# Escape sed metacharacters in the (already URL-safe) replacement value.
escaped=$(printf '%s' "$encoded" | sed -e 's/[\\|&]/\\&/g')
sed -i "s|@MQTTAUTH_SHARED_SECRET@|${escaped}|g" "$CONF"

exec docker-entrypoint.sh "$@"

