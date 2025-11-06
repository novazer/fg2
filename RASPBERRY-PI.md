# Running the server on a Raspberry Pi

1. `cd myfolder`
1. `git clone https://github.com/novazer/fg2.git`
1. `cd fg2/`
1. `cp .env.sample .env`
1. `vi .env` (or edit this file in any other way)
1. `wget https://github.com/themattman/mongodb-raspberrypi-docker/releases/download/r7.0.4-mongodb-raspberrypi-docker-unofficial/mongodb.ce.pi4.r7.0.4-mongodb-raspberrypi-docker-unofficial.tar.gz`
2. `docker load --input mongodb.ce.pi4.r7.0.4-mongodb-raspberrypi-docker-unofficial.tar.gz`
1. Add the following line to your `.env` file to use the unofficial MongoDB image for Raspberry Pi:
   ```
   DOCKER_MONGODB_IMAGE=mongodb-raspberrypi4-unofficial-r7.0.4:latest
   DOCKER_MONGODATA_EXTERNAL=true
   DOCKER_MONGODATA_VOLUME=mongodata
   DOCKER_INFLUXDATA_EXTERNAL=true
   DOCKER_INFLUXDATA_VOLUME=influxdata
   ```
1. `docker volume create mongodata`
1. `docker volume create influxdata`
1. `docker compose up --build -d --remove-orphans`
1. Go to `http://<youripOrDomain>:8080` to access the web interface
1. Now continue with the [Firmware building](README.md#firmware-building) steps to build upload your custom firmware.

Please note that the `backup.sh` and `restore.sh` scripts are not compatible with the Raspberry Pi setup due to 
differences in the MongoDB image used. You will need to perform backups and restores manually. See
[backing up and restoring data volumes](https://docs.docker.com/engine/storage/volumes/#back-up-restore-or-migrate-data-volumes)
for more information on how to do this. The volumes are named `mongodata` and `influxdata` as specified in the `.env` file.
(You should run  `docker compose stop` before backing up or restoring to ensure data consistency.)