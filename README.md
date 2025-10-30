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
1. `docker-compose up --build -d --remove-orphans`
1. Go to `http://<youripOrDomain>:8080` to access the web interface

### Upgrading / Restarting
1. `cd myfolder/fg2/`
1. `git pull` (optional: this gets you the latest changes from the repo)
1. `docker-compose up --build -d --remove-orphans` 

### Firmware building
Before being able to connect the module to your server, you need to build a custom firmware. This firmware contains the 
server url specified in your .env file.
1. `cd myfolder/fg2/`
1. `./build-fw.sh`

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

## Development

Easiest method is probably the same as above for now.