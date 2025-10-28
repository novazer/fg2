Import("env")
import os

if "FW_VERSION_ID" in os.environ:
  print("FIRMWARE VERSION:" + os.environ["FW_VERSION_ID"])

  env.Append(CPPDEFINES=[
    ("FIRMWARE_VERSION", "\\\"" + os.environ["FW_VERSION_ID"] + "\\\""),
    ("MQTT_HOST", "\\\"" + os.environ["MQTT_HOST"] + "\\\""),
    ("MQTT_PORT", "\\\"" + os.environ["MQTT_PORT"] + "\\\""),
    ("API_URL", "\\\"" + os.environ["API_URL"] + "\\\""),
  ])

  # ("FIRMWARE_VERSION", "\"" + os.environ["FW_VERSION_ID"] + "\""),