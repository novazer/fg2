#!/bin/bash
set -e

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

if [ -z "$BACKUP_FILENAME" ]; then
    export BACKUP_FILENAME="backup-$(date +%F_%H-%M-%S)"
fi

docker-compose exec mongodb mongodump \
    --username "$MONGODB_ADMINUSERNAME" \
    --password "$MONGODB_ADMINPASSWORD" \
    --quiet \
    --archive=/backup.mongodump
docker cp "$(docker-compose ps -q mongodb)":/backup.mongodump "${BACKUP_FILENAME}.mongodump"
docker-compose exec mongodb rm -rf /backup.mongodump || true

docker-compose exec influxdb rm -rf /influxdb-backup* || true
docker-compose exec influxdb influx backup /influxdb-backup
docker-compose exec influxdb tar cf /influxdb-backup.tar /influxdb-backup
docker cp "$(docker-compose ps -q influxdb)":/influxdb-backup.tar "${BACKUP_FILENAME}.influxdump"
docker-compose exec influxdb rm -rf /influxdb-backup* || true