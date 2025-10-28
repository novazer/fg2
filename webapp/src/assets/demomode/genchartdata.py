import requests
from datetime import timezone
import datetime
import time
import json
import math

timeframe = 24 * 3600 * 1000
host = "10.100.10.135"

today = datetime.datetime.utcnow().date()
start = datetime.datetime(today.year, today.month, today.day, tzinfo=timezone.utc)

dt = datetime.datetime.now(timezone.utc)
utc_time = dt.replace(tzinfo=timezone.utc)
utc_timestamp = start.timestamp()

interval = 12 * 3600 * 1000
steps = math.ceil(timeframe / interval)
ts_to = int(utc_timestamp * 1000 - (steps - 1) * interval)
ts_from = int(utc_timestamp * 1000 - steps * interval)


result = []

for i in range(steps):
    print(f"requesting: {ts_from} to {ts_to}")
    with requests.get(f'http://{host}/api/data?from={ts_from}&to={ts_to}') as request:
        for line in request.text.split('\n'):
            items = line.split(';')
            if(len(items) == 21):
                ts = int(items[-1])
                ts = int(utc_timestamp * 1000) - ts
                r = ";".join(items[:-1])
                # r = f'{round(float(items[0]), 2)};{round(float(items[1]), 2)};{items[2]};{int(float(items[3]))};{items[4]};{items[5]};{items[6]};{items[7]};{items[8]};{items[9]};{items[10]};{items[11]};{items[12]};{items[13];{items[13]}'
                result.append({"csv": r, "ts": ts})
    ts_to += interval
    ts_from += interval

print(f'generated {len(result)} entries')

with open('chart_data.json', 'w') as file:
    file.write(json.dumps(result))
