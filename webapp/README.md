# Webapp Documentation (AI generated)

This document describes the key features of the web app and how it communicates with the server (API). It is intended for developers, admins, and power users who want to understand the flows or extend the app.

## Table of Contents
- [Overview](#overview)
- [Architecture in Short](#architecture-in-short)
- [Configuring the Server URL](#configuring-the-server-url)
- [Authentication and Sessions](#authentication-and-sessions)
- [Device Management (DeviceService & DeviceAdminService)](#device-management-deviceservice--deviceadminservice)
- [Measurements (DataService)](#measurements-dataservice)
- [User Management (UsersService)](#user-management-usersservice)
- [Error Handling and Robustness](#error-handling-and-robustness)
- [Security](#security)
- [Server Communication Flow (Text Diagram)](#server-communication-flow-text-diagram)
- [Development and Operations](#development-and-operations)
- [Known Intervals](#known-intervals)
- [Charts (Measurements)](#charts-measurements)
- [References (Charts)](#references-charts)

## Overview
- Tech stack: Ionic/Angular
- Language: TypeScript
- Directory: `cloud/webapp`
- Server communication via REST API (JSON) using `environment.API_URL`
- Authentication: JWT (access + refresh token), automatically added as Bearer token by an HTTP interceptor
- Periodic updates: polling every 10 seconds for latest measurements and device/class lists

Key services (selection):
- Authentication: `src/app/auth/auth.service.ts`, interceptor: `src/app/auth/auth.interceptor.ts`
- Device management: `src/app/services/devices.service.ts`
- Measurement data: `src/app/services/data.service.ts`
- User management: `src/app/services/users.service.ts`

## Architecture in Short
- Components (pages, components) bind data through services which communicate with the backend via Angular `HttpClient`.
- `AuthInterceptor` automatically attaches `Authorization: Bearer <id_token>` to every request when tokens are present.
- States such as "authenticated" or "current user" are published via `BehaviorSubject`, so UI components react automatically.

## Configuring the Server URL
- The base API URL comes from `environment.API_URL` (file: `src/environments/environment*`).

## Authentication and Sessions
File: `src/app/auth/auth.service.ts`

Flow:
1. Login with username/password: POST `${API_URL}/login` → returns `userToken` (id_token) + `refreshToken` + `user`.
2. Tokens are stored in `localStorage`:
   - `id_token` (JWT for Authorization header)
   - `refresh_token` (JWT for refresh)
   - `expires_at` (ISO timestamp for expiration handling)
3. Automatic refresh: shortly before expiration `refresh()` is called → POST `${API_URL}/refresh` with `token: <refresh_token>` → new tokens + new `expires_at`.
4. Logout clears localStorage and navigates to the login page.

Additional endpoints (auth-related):
- Account activation: POST `${API_URL}/activate` `{ activation_code }`
- Registration: POST `${API_URL}/signup` `{ username, password }`
- Change password: POST `${API_URL}/changepass` `{ password }`
- Request reset token: POST `${API_URL}/getreset` `{ username: <email> }`
- Reset password: POST `${API_URL}/reset` `{ password, token }`

HTTP Interceptor (`src/app/auth/auth.interceptor.ts`):
- Adds the header `Authorization: Bearer <id_token>` to each request when an `id_token` is present.
- Without a token, the request passes unchanged (e.g., for login/activation).

## Device Management (DeviceService & DeviceAdminService)
File: `src/app/services/devices.service.ts`

User devices (DeviceService):
- Load list: GET `${API_URL}/device` → `Device[]`
- Claim device: POST `${API_URL}/device` `{ claim_code }`
- Release device: DELETE `${API_URL}/device/{device_id}`
- Fetch configuration: GET `${API_URL}/device/config/{device_id}` → string
- Read/clear logs: GET/DELETE `${API_URL}/device/logs/{device_id}`
- Set settings: POST `${API_URL}/device/configure` `{ device_id, configuration }`
- Set display name: POST `${API_URL}/device/setname` `{ device_id, name }`
- Test outputs: POST `${API_URL}/device/test/{device_id}` `{ heater, dehumidifier, co2, lights }`
- Stop test: DELETE `${API_URL}/device/test/{device_id}`
- Device by serial number: GET `${API_URL}/device/byserial?serialnumber=...`

Device classes & firmware (DeviceAdminService):
- Load firmware/class overview (polling every 10s): GET `${API_URL}/device/firmwareversions`
- Create/update class: POST `${API_URL}/device/class` or `${API_URL}/device/class/{class_id}` `{ name, description, concurrent, maxfails, firmware_id }`
- Upload firmware: POST `${API_URL}/device/firmware` (Multipart FormData: `file`, `name`, `version`)

## Measurements (DataService)
File: `src/app/services/data.service.ts`

- Latest measurements (per device/measure) are updated by polling every 10s:
  - GET `${API_URL}/data/latest/{device_id}/{measure}` → `{ value: number }` (if present)
- Fetch time series:
  - GET `${API_URL}/data/series/{device_id}/{measure}?from=<expr>&to=<expr>&interval=<iso>`
  - The response is transformed to pairs `[timestamp_ms, value]`, suitable for charts.

Note: `measure()` returns a `BehaviorSubject<number>` that UI components can subscribe to.

## User Management (UsersService)
File: `src/app/services/users.service.ts`

- User list: GET `${API_URL}/users` → `User[]`
- Create user: POST `${API_URL}/users` `{ username, password, is_admin }`

## Error Handling and Robustness
- Auth refresh fails → app sets `authenticated=false` and expects a new login.
- Measurement fetch: when no data exists, `NaN` is published so the UI can react neutrally.
- Per-device JSON configuration: if `configuration` is not parseable, it falls back to `{}`.

## Security
- Tokens are stored in `localStorage`. In production environments, ensure secure delivery (HTTPS).
- CORS and CSRF: API must allow CORS properly. CSRF is not used here because Bearer JWT is used.
- Enforce access protection on the server side; the client is only a consumer.

## Server Communication Flow (Text Diagram)
- UI event → service method → HttpClient request
- AuthInterceptor attaches Authorization header (if present)
- Server responds (JSON) → service transforms/distributes data (BehaviorSubject) → component renders
- Periodic tasks (setInterval) trigger updates (e.g., 10s polling)

## Development and Operations
- Local development: configure `environment.ts` so that `API_URL` points to a reachable API.
- Docker/Nginx: see `cloud/webapp/nginx.conf` for Nginx configuration used in container deployments.
- Running in the stack: see `cloud/README.md` for starting via Docker Compose and setting up devices.

## Known Intervals
- Update latest measurements: every 10s (`DataService`)
- Update firmware/class list: every 10s (`DeviceAdminService`)

## Charts (Measurements)
This page visualizes time series of device measurements. Implementation and files:
- Components/modules: `src/app/device/charts/charts.page.ts` + `.html` + `.scss`, module: `src/app/device/charts/charts.module.ts`
- Libraries: Highcharts Highstock (`highcharts-angular`), initially including: `boost`, `no-data-to-display`, `highcharts-more`

How it works (data flow):
- Data is provided by `DataService.getSeries(device_id, measure, timespan, interval)` from `src/app/services/data.service.ts`.
  - Request: GET `${API_URL}/data/series/{device_id}/{measure}?from=<expr>&to=now()&interval=<iso>`
  - The response is transformed to pairs `[timestamp_ms, value]`, directly usable for Highcharts.
- The charts page loads data on open and on interaction (switch timespan, toggle measures).
  - Currently, there is no automatic periodic reload; reloads are triggered only by user actions.

Timespans and sampling intervals (presets):
- 1h → from `-1h`, interval `10s`
- 24h → from `-1d`, interval `20s` (default on open)
- 1w → from `-7d`, interval `10m`
- 1m → from `-30d`, interval `60m`
These presets are defined in `charts.page.ts` as a `timespans` array and control both the time range and the downsampling interval (aggregated/downsampled on the server).

Measures and device specifics:
- Available measures are defined in `charts.page.ts` as a `measures` array, e.g., temperature, humidity, CO2, outputs (heater/dehumidifier/fan/CO2 valve/lights), etc.
- Each measure has properties: `title`, `icon`, `color`, `name` (API measure), `unit`, `enabled` (initial visibility), `right` (right/left axis), `nav` (show in navigator), `types` (allowed device types).
- Depending on `device_type`, only those measures whose `types` contain the type are displayed in `ngOnInit` (`filtered_measures`).

Highcharts configuration (key points):
- Chart type is `stockChart` with local time (`time.useUTC = false`).
- Range selector buttons are disabled because custom buttons (the presets) are used.
- A dedicated Y-axis (`yAxis[]`) is created for each visible measure:
  - Axis and label colors follow the measure color; units are appended via `labels.format`.
  - Axis side via `opposite` per measure.
  - Responsiveness: on narrow views (width ≤ 320px) axes are hidden to save space.
- Series: one series per measure of type `area` with light fill (`fillOpacity: 0.1`), `threshold: null`.
  - Tooltip: `valueDecimals: 2`, `valueSuffix` matches the measure unit.
  - Series visibility follows the measure's `enabled` state.
- Navigator (mini map): enabled when `window.innerHeight > 600`. The first active series is shown in the navigator (`showInNavigator`).

UI interaction:
- Switch timespan: buttons 1h/24h/1w/1m call `setSpan()` → reloads all visible series.
- Toggle measures: clicking the respective icon calls `toggleMeasure()` → axes/series are rebuilt and data reloaded if necessary.

Empty/missing data:
- If the API returns no values, the series gets an empty array; Highcharts then shows no line. The `no-data-to-display` mode is prepared.

Performance and scaling:
- Downsampling takes place due to the preset intervals to keep the number of points low.
- Highcharts Boost module is included to remain performant even with larger datasets.

## References (Charts)
- `src/app/device/charts/charts.page.ts`
- `src/app/device/charts/charts.page.html`
- `src/app/device/charts/charts.module.ts`
- `src/app/services/data.service.ts`
