# Server Documentation (AI generated)

## Interactive API Docs (Swagger UI)
- The server now exposes interactive API documentation at `/api-docs`.
- How to use:
  - Start the stack (see docker-compose instructions).
  - Open: `http://localhost:8081/api-docs`
  - Try endpoints directly in the browser; for secured routes, click "Authorize" and paste a `Bearer` token (`userToken`).

## Overview & Architecture
- Runtime: Node.js with Express (TypeScript)
- Entry point: `cloud/server/src/server.ts` → instantiates `App` (`cloud/server/src/app.ts`) and mounts routes.
- Routes mounted:
  - `AuthRoute` (`/signup`, `/login`, `/refresh`, …)
  - `UsersRoute` (`/users/*`)
  - `DeviceRoute` (`/device/*`)
  - `DataRoute` (`/data/*`)
  - `MqttAuthRoute` (`/mqttauth/*`)
  - `IndexRoute`
- Persistence:
  - MongoDB for users, devices, configurations, logs, firmware metadata.
  - InfluxDB 2.x for measurements/time series.
- Messaging: RabbitMQ (with MQTT plugin) for device connectivity.
- Webapp communicates with this server over HTTP/JSON using Bearer JWT.

## Services in Docker Compose
See `cloud/docker-compose.yaml`.
- `mongodb` (MongoDB 4.4) with volume `fg2_mongodata`
- `mongo-express` admin UI (optional), port `${MONGOEXPRESS_PORT_EXTERNAL}`
- `influxdb` (InfluxDB 2.7) with volume `fg2_influxdata`
- `rabbitmq` (built from `cloud/rabbitmq`), exposes MQTT on `${MQTT_PORT_EXTERNAL}`
- `webapp` (Angular/Ionic, served by Nginx)
- `server` (this API), exposes HTTP `${API_PORT_EXTERNAL}` mapping to `${API_PORT}` inside the container

The `server` service links to MongoDB, InfluxDB, and RabbitMQ and sets all required environment variables from `.env`.

## Configuration (.env)
Template: `cloud/.env.sample` – copy to `.env` and adjust.

Important variables (selection):
- API / App
  - `API_PORT` (internal), `API_PORT_EXTERNAL` (host exposed port)
  - `API_URL_EXTERNAL` External base URL (used e.g. in webapp build)
  - `TOKEN_SECRET_KEY` Secret for signing JWT tokens
  - `ENABLE_SELF_REGISTRATION` (`true|false`) Allow open signup
  - `SELF_REGISTRATION_PASSWORD` Shared password for self-registration (if enabled)
  - `REQUIRE_ACTIVATION` (`true|false`) Email activation required
  - SMTP settings for activation emails: `ACTIVATION_SENDER`, `ACTIVATION_SMTP_*`
  - Admin bootstrap: `ADMINUSER_USERNAME`, `ADMINUSER_PASSWORD`
- MongoDB
  - `MONGODB_ADMINUSERNAME`, `MONGODB_ADMINPASSWORD`, `MONGODB_DATABASE`
- InfluxDB 2.x
  - `INFLUXDB_USERNAME`, `INFLUXDB_PASSWORD`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET`, `INFLUXDB_TOKEN`
  - `INFLUXDB_HOST` is set by compose to `influxdb` for the server container
- RabbitMQ / MQTT
  - `MQTT_PORT_EXTERNAL` (host port exposed by RabbitMQ)
  - `MQTT_URL` is set to `rabbitmq` inside the compose network
- Other
  - `AUTOMATION_TOKEN` Token for internal automation tasks
  - Logging: `LOG_FORMAT` (default `combined`), `LOG_DIR` (default `/var/log/plantalytix`)

## Authentication & Authorization
- JWT-based auth with short-lived `userToken` (access token) and `refreshToken`.
- Access token is required as `Authorization: Bearer <id_token>` for most routes.
- Refresh flow: POST `/refresh` with `{ token: <refreshToken> }` returns new tokens.
- Admin-only routes require `authAdminMiddleware` (server-side check of admin flag in JWT).

## API Endpoints
This section summarizes the available HTTP endpoints based on the route files under `cloud/server/src/routes/`.

### Index
- `GET /` Basic index route (see `index.route.ts`)

### Auth (`auth.route.ts`)
- `POST /signup` → body `{ username, password }`
- `POST /activate` → body `{ activation_code }`
- `POST /login` → body `{ username, password }`
- `POST /tokenlogin` → login using an existing token (internal)
- `POST /refresh` → body `{ token: <refreshToken> }`
- `POST /getreset` → body `{ username, password:"" }` sends reset link/token
- `POST /reset` → body `{ token, password }` set new password
- `POST /changepass` (auth required) → body `{ username, password }`
- `POST /logout` (auth required)

Responses follow the patterns used in the webapp:
- Successful login returns `{ user, userToken, refreshToken }` where `user` contains `user_id`, `username`, `is_admin`.

### Users (admin) (`users.route.ts`)
All require admin JWT.
- `GET /users` → list users
- `GET /users/:id` → get user by id
- `POST /users` → create user `{ username, password, is_admin }`
- `PUT /users/:id` → update user
- `DELETE /users/:id` → delete user

### Devices (`device.route.ts`)
- `GET /device` (auth) → list user devices
- `POST /device` (auth) → claim device `{ claim_code }`
- `DELETE /device/:device_id` (auth) → unclaim device
- `POST /device/configure` (auth) → set configuration `{ device_id, configuration }`
- `POST /device/setname` (auth) → set display name `{ device_id, name }`
- `GET /device/config/:device_id` (auth) → get configuration (JSON string)
- `POST /device/test/:device_id` (auth) → set outputs for test `{ heater, dehumidifier, co2, lights }`
- `DELETE /device/test/:device_id` (auth) → stop test
- `GET /device/logs/:device_id` (auth) → device logs
- `DELETE /device/logs/:device_id` (auth) → clear logs
- `GET /device/byserial` (admin) → query by serial number `?serialnumber=...`
- `GET /device/onlinedevices` (admin)
- `GET /device/firmwareversions` (admin)
- Firmware management (admin):
  - `GET /device/firmware` list
  - `GET /device/firmware/find` search
  - `GET /device/firmware/:firmware_id/:binary` download binary
  - `POST /device/firmware` create firmware (form: `file`, `name`, `version`)
  - `POST /device/firmware/:firmware_id/:binary` upload binary
- Device classes (admin):
  - `GET /device/class` list
  - `GET /device/class/find/:class_name` find by name
  - `GET /device/class/:class_id` get class
  - `POST /device/class` create
  - `POST /device/class/:class_id` update
- Device registration (factory/provisioning):
  - `POST /device/register` with device data
  - Claim code helpers: `POST /device/claimcode` and legacy `/auth/v0.0.1/device/claimcode`

### Data (measurements) (`data.route.ts`)
- `GET /data/series/:device_id/:measure?from=<expr>&to=<expr>&interval=<iso>` → returns aggregated series as array of objects `{ _time, _value }`
- `GET /data/latest/:device_id/:measure` → returns latest `{ value }`

The webapp converts series to `[timestamp_ms, value]` for charts.

### MQTT Auth (RabbitMQ plugin) (`mqttauth.route.ts`)
These endpoints are for RabbitMQ’s HTTP auth backend. They are not for end users.
- `POST /mqttauth/user`
- `POST /mqttauth/vhost`
- `POST /mqttauth/topic`
- `POST /mqttauth/resource`

## Storage
### MongoDB (metadata)
- Stores users, devices, claims, configurations, device logs, firmware/class metadata.
- Connection assembled via `dbConnection` (see `cloud/server/src/databases` and `config`).

### InfluxDB 2.x (time series)
- Stores measurements per device/measure.
- Server queries Influx using `INFLUXDB_*` environment vars.

## Operations

### Logs
- Server uses `morgan` with `LOG_FORMAT` and logs to stdout (captured by Docker). Ensure `LOG_DIR` exists if you switch to file logging.

### Backup & Restore
- Use helper scripts in `cloud/`:
  - Backup: `./backup.sh` → creates two files `backup-<timestamp>.influxdump` and `backup-<timestamp>.mongodump` in repo root.
  - Restore: `./restore.sh backup-<timestamp>` (pass the common prefix without extension; place files in repo root first).
- Also consider backing up your `.env`.

## Security Considerations
- Always deploy behind HTTPS (reverse proxy/ingress) so JWTs are not exposed.
- Keep `TOKEN_SECRET_KEY` secret and rotate if compromised.
- Restrict `mongo-express` exposure (use firewall/VPN or disable in production).
- Set strong admin bootstrap credentials; disable self-registration or protect with `SELF_REGISTRATION_PASSWORD`.
- CORS is enabled broadly by default (`app.ts` uses `cors()`); tighten if needed via `ORIGIN`/`CREDENTIALS` wiring.

## Troubleshooting
- API not reachable:
  - Check `docker-compose ps` and logs: `docker-compose logs -f server`.
  - Verify `API_PORT_EXTERNAL` not used by another process.
- Auth errors (401):
  - Confirm `Authorization: Bearer <token>` header and token freshness; try `/refresh`.
  - Ensure `TOKEN_SECRET_KEY` consistent between runs.
- No measurements:
  - Check InfluxDB credentials and bucket/org/token in `.env`.
  - Verify device is sending data via MQTT and ingestion pipeline is healthy.
- Device claiming fails:
  - Confirm device is online and claim code is valid (`/device/claimcode`).


