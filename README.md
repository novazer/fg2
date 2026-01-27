# Fridge Grow Software Stack - Forked from Plantalytix

See also:
- [Running on Raspberry PI](RASPBERRY-PI.md)
- [Upgrading an older firmware](UPGRADING-FIRMWARE.md)
- [TriAC-FIX (en)](TriAC-FIX.en.md) or [TriAC-FIX (de)](TriAC-FIX.de.md)

## Getting started

### Prerequisites
- Docker
- Docker Compose
- Git
- A new firmware, that has the "Change server" option (see [Upgrading an older firmware](UPGRADING-FIRMWARE.md) if you don't have this)

### Quickstart
1. `cd myfolder`
1. `git clone https://github.com/novazer/fg2.git`
1. `cd fg2/`
1. `cp .env.sample .env`
1. `vi .env` (or edit this file in any other way) 
1. `docker compose up --build -d --remove-orphans`
1. Go to `http://<youripOrDomain>:8080` to access the web interface

### Firmware building
Before being able to connect the module to your server, you need to build a custom firmware. This firmware contains the 
server url specified in your .env file.
1. `cd myfolder/fg2/`
1. `./build-fw.sh`
1. Now you can use the "Change server" option in the module to flash the firmware to your module. You'll need to input 
   the `API_URL_EXTERNAL` and the `SELF_REGISTRATION_PASSWORD` values from your `.env` file with the knob.
1. If the operation failed, it will display "connecting..." after pressing a button. This will not disappear until you 
   restart the module. 

### Upgrading / Restarting
1. `cd myfolder/fg2/`
1. `git pull` (optional: this gets you the latest changes from the repo)
1. `docker compose up --build -d --remove-orphans`
1. `./build-fw.sh` (if you want to update the firmware as well)

## Management

### Admin tools
After running, you can access the management tools:
- http://localhost:8072 - RabbitMQ Management (guest, guest)
- http://localhost:8088 - Mongo Express (admin, pass)
- http://localhost:8086 - InfluxDB UI (*see `.env`*)

### Backup
1. `cd myfolder/fg2/`
2. `./backup.sh`

This produces two files that are both needed, e.g.
```
backup-2025-10-29_22-12-27.influxdump
backup-2025-10-29_22-12-27.mongodump
```

Additionally, you may want to back up the `.env` file as well.

### Restore
1. `cd myfolder/fg2/`
2. Place the backup files here
2. `docker compose stop server`
2. `./restore.sh backup-2025-10-29_22-12-27`
2. `docker compose up -d`
3. It may be necessary to create a new firmware version. Run `./build-fw.sh` if needed.

## Cleanup
To remove all data and start fresh:
1. `cd myfolder/fg2/`
2. `docker compose down --volumes`
4. `cd ../`
5. `rm -rf fg2/`
6. When starting fresh, you'll also need to use the module's "Change server" again, as this registers the module in the 
   server again.

## Development

### Frontend

1. `cd webapp/`
2. `npm install`
3. Optional: Edit `src/environments/environment.ts` to point to `https://fg2.novazer.com/api` for easier testing.
4. `npm start`

And before committing:
1. `npm run lint:fix`
1. `npm run build`

### Backend

1. `cd server/`
2. `npm install`
3. Set all required environment variables (see the server's environment variables in `docker-compose.yaml`).
4. `npm start`

And before committing:
1. `npm run lint:fix`
2. `npm run build`

### Firmware

Make sure that the following environment variables are set in `.env`:
```
API_URL_EXTERNAL=https://fg2.novazer.com/api
MQTT_HOST_EXTERNAL=fg2.novazer.com
MQTT_PORT_EXTERNAL=4883
```

(Adjust them as needed if you want to host the server yourself.)

Then try running `./provision-fw.sh fridge` to build a firmware for the fridge module and provision it via USB.

## Documentation
- Webapp: [Webapp](webapp/README.md)
- Server: [Server](server/README.md)
