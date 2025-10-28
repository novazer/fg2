## Plantalytix Software Stack - Docker compose Edition

### Installation

1. Rename global configuration file from .env.sample to .env
2. Edit .env file and change all necessary values, especially those related to connection urls
3. Start the stack by running ```docker-compose up```
4. Build device firmware by running ```./build-fw.sh```
5. Connect your devices via "Wifi" -> "Change server" on the display of the device. Use the url and password specified in the .env file.
6. Pair devices as ususal