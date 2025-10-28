###############################################################
# compresses all files found in ..\..\tasmota\html_uncompressed
# write compressed C code to    ..\..\tasmota\html_compressed
# Instructions:
# open a console, e.g. in vscode, open a 'terminal'
# cd .\tools\unishox
# run:
# python compress-html-uncompressed.py
#
# The intent it to commit both uncompressed and compressed to the repo
# else this script would need to be run at build.
#
# Example Tasmota code:
# #ifdef USE_UNISHOX_COMPRESSION
#   #include "./html_compressed/HTTP_SCRIPT_CONSOL.h"
# #else
#   #include "./html_uncompressed/HTTP_SCRIPT_CONSOL.h"
# #endif
#
###############################################################

from os import listdir
from os import path
from datetime import datetime
import base64
import zlib

path_uncompressed = path.join('..','html')
path_compressed   = path.join('..','src', 'html_compressed')

files = listdir(path_uncompressed)

totalIn = 0
totalSaved = 0

for file in files:
  f = open(path_uncompressed + path.sep + file, "r")
  input = f.read()
  f.close()

  const_name = file.upper()
  const_name = const_name.replace('.', '_')

  # parsing and cleaning

  print("####### Parsing input from " + path_uncompressed + path.sep + file)

  in_bytes = bytearray(input, 'utf-8')
  in_len = len(in_bytes)

  bytes = input.encode('ascii')
  zbytes = zlib.compress(bytes)
  out_bytes = base64.b64encode(bytes)
  out_len = len(out_bytes)

  print(out_bytes)

  def chunked(my_list, n):
      return [my_list[i * n:(i + 1) * n] for i in range((len(my_list) + n - 1) // n )]

  # split in chunks of 20 characters
  chunks = chunked(out_bytes, 80)

  lines_raw = [ "\t\"" + chunk.decode('ascii') + "\"" for chunk in chunks ]

  line_complete = "const char " + const_name + "_COMPRESSED" +"[] PROGMEM = \n\t" + ("\n\t").join(lines_raw) + ";"
  lines = "\nconst size_t " + const_name +"_SIZE = {size};\n{lines}\n\n".format(size=in_len, lines=line_complete)

  comment = "/////////////////////////////////////////////////////////////////////\n"
  comment = comment + "// compressed by scripts/html-compress.py \n"
  comment = comment + "/////////////////////////////////////////////////////////////////////\n"

  f = open(path_compressed + path.sep + file + '.h', "w")
  f.write(comment + lines)
  f.close()
  print("####### Wrote output to " + path_compressed + path.sep + file)

print("If all files are in use, total saving was "+str(totalSaved)+" out of "+str(totalIn))
