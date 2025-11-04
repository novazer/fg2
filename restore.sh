#!/bin/bash
set -e

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

if [ -z "$BACKUP_FILENAME" ]; then
    export BACKUP_FILENAME="$1"

    if [ -z "$BACKUP_FILENAME" ]; then
        echo "Error: Backup filename not provided."
        echo "Usage: $0 <backup-filename-without-extension>"
        exit 1
    fi
fi

if [ -z "$BACKUP_FILENAME" ]; then
    export BACKUP_FILENAME="backup-$(date +%F_%H-%M-%S)"
fi

MONGO_CONTAINER="$(docker compose ps -q mongodb)"
if [ -z "$MONGO_CONTAINER" ]; then
    echo "Error: MongoDB container is not running."
    exit 1
fi

INFLUX_CONTAINER="$(docker compose ps -q influxdb)"
if [ -z "$INFLUX_CONTAINER" ]; then
    echo "Error: InfluxDB container is not running."
    exit 1
fi

docker cp "${BACKUP_FILENAME}.mongodump" "$MONGO_CONTAINER":/backup.mongodump
docker compose exec mongodb mongorestore \
    --username "$MONGODB_ADMINUSERNAME" \
    --password "$MONGODB_ADMINPASSWORD" \
    --drop \
    --archive=/backup.mongodump
docker compose exec mongodb rm -rf /backup.mongodump || true

docker compose exec influxdb rm -rf /influxdb-backup* || true
docker cp "${BACKUP_FILENAME}.influxdump" "$INFLUX_CONTAINER":/influxdb-backup.tar
docker compose exec influxdb tar xf /influxdb-backup.tar
docker compose exec influxdb influx bucket delete -n "${INFLUXDB_BUCKET}" -o "${INFLUXDB_ORG}"
docker compose exec influxdb influx restore --bucket="${INFLUXDB_BUCKET}" --org="${INFLUXDB_ORG}" /influxdb-backup
docker compose exec influxdb rm -rf /influxdb-backup* || true

echo "RESTORE SUCCESSUL"