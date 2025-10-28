
from os import listdir
from os import path
from PIL import Image
import numpy as np

path_uncompressed = path.join('..','icons_noborder')
path_compressed   = path.join('..','src')

files = listdir(path_uncompressed)

totalIn = 0
totalSaved = 0

for file in files:
  img = Image.open(path_uncompressed + path.sep + file)
  name = file.split('.')[0].upper()
  size = img.width * img.height
  entry = "const PROGMEM uint8_t ICON_{file}[] = {{\n".format(file = name)
  rows = np.array(img)
  for row in rows:
    entry += "0b"
    pixelpos = 0
    for pixel in row:
      entry += "{}".format(pixel)
      pixelpos += 1
      if pixelpos == 8:
        entry += ", 0b"
    entry += ",\n"
  entry += "};\n"
  print(entry)
