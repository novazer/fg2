#!/usr/bin/env bash

# platformio run --target erase
# python3 ~/.platformio/packages/tool-esptoolpy@1.30100.210531/esptool.py --port /dev/ttyUSB0 write_flash 0x610000 provisioning.bin
# python3 ~/.platformio/packages/tool-esptoolpy@1.30100.210531/esptool.py --port /dev/ttyUSB0 write_flash 0x9000 settings.bin
# platformio run --target upload



# python3 ~/.platformio/packages/tool-esptoolpy@1.30100.210531/esptool.py --port /dev/ttyUSB0 erase_region 0x4000 0x2000
python3 ~/.platformio/packages/tool-esptoolpy@1.30100.210531/esptool.py --port /dev/ttyUSB0 --baud 460800 write_flash --flash_mode dio --flash_freq 40m  0x210000 .pio/build/fridge/firmware.bin
python3 ~/.platformio/packages/tool-esptoolpy@1.30100.210531/esptool.py --port /dev/ttyUSB0 --baud 460800 write_flash --flash_mode dio --flash_freq 40m  0x410000 .pio/build/fridge/firmware.bin
