# Fridge Grow Software Stack - Forked from Plantalytix

## Getting started

### Prerequisites
- Docker
- Docker Compose
- Git

### Quickstart
1. `cd myfolder`
1. `git clone https://github.com/novazer/fg2.git`
1. `cd fg2/`
1. `cp .env.sample .env`
1. `vi .env` (or edit this file in any other way) 
1. `docker volume create fg2_influxdata`
1. `docker volume create fg2_mongodata`
1. `docker-compose up --build -d --remove-orphans`
1. Go to `http://<youripOrDomain>:8080` to access the web interface

### Firmware building
Before being able to connect the module to your server, you need to build a custom firmware. This firmware contains the 
server url specified in your .env file.
1. `cd myfolder/fg2/`
1. `./build-fw.sh`

### Upgrading / Restarting
1. `cd myfolder/fg2/`
1. `git pull` (optional: this gets you the latest changes from the repo)
1. `docker-compose up --build -d --remove-orphans`
1. `./build-fw.sh` (if you want to update the firmware as well)

## Management

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
2. `./restore.sh backup-2025-10-29_22-12-27`

## Cleanup
1. `cd myfolder/fg2/`
2. `docker-compose down --volumes`
3. `docker volume rm fg2_influxdata fg2_mongodata`

## Development

Easiest method is probably the same as above for now.

## Documentation
- Webapp: [Webapp](webapp/README.md)
- Server: [Server](server/README.md)
