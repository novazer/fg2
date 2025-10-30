# Webapp Dokumentation (DE)

Diese Dokumentation beschreibt die wichtigsten Funktionen der Webapp sowie die Kommunikation mit dem Server (API). Sie richtet sich an Entwickler:innen, Admins und Power-User, die die Abläufe verstehen oder die App erweitern möchten.

## Inhaltsverzeichnis
- [Überblick](#überblick)
- [Architektur kurz erklärt](#architektur-kurz-erklärt)
- [Konfiguration der Server-URL](#konfiguration-der-server-url)
- [Authentifizierung und Sessions](#authentifizierung-und-sessions)
- [Geräteverwaltung (DeviceService & DeviceAdminService)](#geräteverwaltung-deviceservice--deviceadminservice)
- [Messdaten (DataService)](#messdaten-dataservice)
- [Benutzerverwaltung (UsersService)](#benutzerverwaltung-usersservice)
- [Fehlerbehandlung und Robustheit](#fehlerbehandlung-und-robustheit)
- [Sicherheit](#sicherheit)
- [Ablauf der Serverkommunikation (Kurzdiagramm in Textform)](#ablauf-der-serverkommunikation-kurzdiagramm-in-textform)
- [Entwicklung und Betrieb](#entwicklung-und-betrieb)
- [Bekannte Intervalle](#bekannte-intervalle)
- [Diagramme (Messwerte)](#diagramme-messwerte)
- [Referenzen (Diagramme)](#referenzen-diagramme)

## Überblick
- Technologie-Stack: Ionic/Angular
- Programmiersprache: TypeScript
- Verzeichnis: `cloud/webapp`
- Serverkommunikation via REST-API (JSON) über `environment.API_URL`
- Authentifizierung: JWT (Access- + Refresh-Token), automatisch als Bearer-Token per HTTP-Interceptor beigefügt
- Periodische Aktualisierung: Polling im 10-Sekunden-Intervall für Messwerte und Geräte-/Klassenlisten

Wichtige Services (Auszug):
- Authentifizierung: `src/app/auth/auth.service.ts`, Interceptor: `src/app/auth/auth.interceptor.ts`
- Geräteverwaltung: `src/app/services/devices.service.ts`
- Messdaten: `src/app/services/data.service.ts`
- Benutzerverwaltung: `src/app/services/users.service.ts`

## Architektur kurz erklärt
- Komponenten (Pages, Components) binden Daten über Services, die via `HttpClient` mit dem Backend sprechen.
- `AuthInterceptor` hängt bei vorhandenen Tokens automatisch `Authorization: Bearer <id_token>` an jede Anfrage an.
- Zustände wie „angemeldet“ oder „aktueller Benutzer“ werden über `BehaviorSubject` publiziert, sodass UI-Komponenten automatisch reagieren.

## Konfiguration der Server-URL
- Die Basis-URL der API stammt aus `environment.API_URL` (Datei: `src/environments/environment*`).

## Authentifizierung und Sessions
Datei: `src/app/auth/auth.service.ts`

Ablauf:
1. Login mit Benutzername/Passwort: POST `${API_URL}/login` → liefert `userToken` (id_token) + `refreshToken` + `user`.
2. Tokens werden im `localStorage` gespeichert:
   - `id_token` (JWT für Authorization Header)
   - `refresh_token` (JWT für Refresh)
   - `expires_at` (ISO-Datum zur Ablaufsteuerung)
3. Automatisches Refresh: Kurz vor Ablauf wird `refresh()` aufgerufen → POST `${API_URL}/refresh` mit `token: <refresh_token>` → neue Tokens + neues `expires_at`.
4. Logout räumt LocalStorage auf und navigiert zur Login-Seite.

Weitere Endpunkte (Auth-bezogen):
- Kontoaktivierung: POST `${API_URL}/activate` `{ activation_code }`
- Registrierung: POST `${API_URL}/signup` `{ username, password }`
- Passwort ändern: POST `${API_URL}/changepass` `{ password }`
- Reset-Token anfordern: POST `${API_URL}/getreset` `{ username: <email> }`
- Passwort zurücksetzen: POST `${API_URL}/reset` `{ password, token }`

HTTP-Interceptor (`src/app/auth/auth.interceptor.ts`):
- Fügt bei jeder Anfrage mit vorhandenem `id_token` den Header hinzu: `Authorization: Bearer <id_token>`.
- Ohne Token wird die Anfrage unverändert weitergeleitet (z. B. für Login/Aktivierung).

## Geräteverwaltung (DeviceService & DeviceAdminService)
Datei: `src/app/services/devices.service.ts`

Geräte des Benutzers (DeviceService):
- Liste laden: GET `${API_URL}/device` → `Device[]`
- Gerät claimen: POST `${API_URL}/device` `{ claim_code }`
- Gerät freigeben: DELETE `${API_URL}/device/{device_id}`
- Konfiguration holen: GET `${API_URL}/device/config/{device_id}` → string
- Logs lesen/löschen: GET/DELETE `${API_URL}/device/logs/{device_id}`
- Einstellungen setzen: POST `${API_URL}/device/configure` `{ device_id, configuration }`
- Anzeigename setzen: POST `${API_URL}/device/setname` `{ device_id, name }`
- Ausgänge testen: POST `${API_URL}/device/test/{device_id}` `{ heater, dehumidifier, co2, lights }`
- Test stoppen: DELETE `${API_URL}/device/test/{device_id}`
- Gerät per Seriennummer: GET `${API_URL}/device/byserial?serialnumber=...`

Geräteklassen & Firmware (DeviceAdminService):
- Firmware-/Klassenübersicht laden (polling alle 10s): GET `${API_URL}/device/firmwareversions`
- Klasse anlegen/aktualisieren: POST `${API_URL}/device/class` bzw. `${API_URL}/device/class/{class_id}` `{ name, description, concurrent, maxfails, firmware_id }`
- Firmware hochladen: POST `${API_URL}/device/firmware` (Multipart FormData: `file`, `name`, `version`)

## Messdaten (DataService)
Datei: `src/app/services/data.service.ts`

- Letzte Messwerte (pro Gerät/Messgröße) werden via Polling alle 10s aktualisiert:
  - GET `${API_URL}/data/latest/{device_id}/{measure}` → `{ value: number }` (falls vorhanden)
- Zeitreihen abrufen:
  - GET `${API_URL}/data/series/{device_id}/{measure}?from=<expr>&to=<expr>&interval=<iso>`
  - Rückgabe wird in `[timestamp_ms, value]` umgewandelt, geeignet für Diagramme.

Hinweis: `measure()` liefert ein `BehaviorSubject<number>`, das UI-Komponenten abonnieren können.

## Benutzerverwaltung (UsersService)
Datei: `src/app/services/users.service.ts`

- Benutzerliste: GET `${API_URL}/users` → `User[]`
- Benutzer anlegen: POST `${API_URL}/users` `{ username, password, is_admin }`

## Fehlerbehandlung und Robustheit
- Auth-Refresh schlägt fehl → App markiert `authenticated=false` und erwartet erneutes Login.
- Messwertabruf: Wenn keine Daten vorhanden sind, wird `NaN` publiziert, sodass UI neutral reagieren kann.
- JSON-Konfiguration pro Gerät: Falls `configuration` nicht parsebar ist, wird auf `{}` zurückgefallen.

## Sicherheit
- Tokens werden im `localStorage` abgelegt. In produktiven Umgebungen auf sichere Auslieferung (HTTPS) achten.
- CORS und CSRF: API muss CORS korrekt erlauben. CSRF wird hier nicht verwendet, da Bearer-JWT genutzt wird.
- Zugriffsschutz serverseitig erzwingen; Client ist nur Konsument.

## Ablauf der Serverkommunikation (Kurzdiagramm in Textform)
- UI-Event → Service-Methode → HttpClient-Aufruf
- AuthInterceptor hängt Authorization-Header an (falls vorhanden)
- Server antwortet (JSON) → Service transformiert/verteilt Daten (BehaviorSubject) → Komponente rendert
- Periodische Tasks (setInterval) triggern Aktualisierungen (z. B. 10s Polling)


## Bekannte Intervalle
- Messwerte aktualisieren: alle 10s (`DataService`)
- Firmware-/Klassenliste aktualisieren: alle 10s (`DeviceAdminService`)


## Diagramme (Messwerte)
Diese Seite visualisiert Zeitreihen von Messwerten eines Geräts. Umsetzung und Dateien:
- Komponenten/Module: `src/app/device/charts/charts.page.ts` + `.html` + `.scss`, Modul: `src/app/device/charts/charts.module.ts`
- Bibliotheken: Highcharts Highstock (`highcharts-angular`), zusätzlich initial eingebunden: `boost`, `no-data-to-display`, `highcharts-more`

Funktionsweise (Datenfluss):
- Die Daten liefert der `DataService.getSeries(device_id, measure, timespan, interval)` aus `src/app/services/data.service.ts`.
  - Request: GET `${API_URL}/data/series/{device_id}/{measure}?from=<expr>&to=now()&interval=<iso>`
  - Rückgabe wird zu Paaren `[timestamp_ms, value]` transformiert, direkt für Highcharts verwendbar.
- Die Diagrammseite lädt die Daten beim Öffnen und bei Interaktion (Zeitspanne wechseln, Messgröße ein-/ausblenden) neu.
  - Aktuell erfolgt kein automatisches periodisches Nachladen; ein erneutes Laden wird nur durch Nutzeraktionen ausgelöst.

Zeitspannen und Abtast-Intervalle (Presets):
- 1h → from `-1h`, interval `10s`
- 24h → from `-1d`, interval `20s` (Standard beim Öffnen)
- 1w → from `-7d`, interval `10m`
- 1m → from `-30d`, interval `60m`
Diese Presets sind in `charts.page.ts` als `timespans`-Array hinterlegt und steuern sowohl den Zeitraum als auch das Downsampling-Intervall (Server-seitig aggregiert/gedownsampled).

Messgrößen (Measures) und Gerätespezifika:
- Die möglichen Messgrößen sind in `charts.page.ts` als `measures`-Array definiert, z. B. Temperatur, Luftfeuchte, CO2, Ausgänge (Heater/Dehumidifier/Fan/CO2 Valve/Lights) u. a.
- Jedes Measure hat Eigenschaften: `title`, `icon`, `color`, `name` (API-Measure), `unit`, `enabled` (Startsichtbarkeit), `right` (Achse rechts/links), `nav` (Anzeige im Navigator), `types` (zulässige Gerätetypen).
- Abhängig vom `device_type` werden in `ngOnInit` nur solche Messgrößen angezeigt, deren `types` den Typ enthalten (`filtered_measures`).

Highcharts-Konfiguration (Kernpunkte):
- Der Highcharts-Komponententyp ist `stockChart` mit lokalem Zeitbezug (`time.useUTC = false`).
- Range-Selector-Buttons sind deaktiviert, da eigene Buttons (die Presets) genutzt werden.
- Für jede sichtbare Messgröße wird eine eigene Y-Achse erzeugt (`yAxis[]`):
  - Achsenfarbe und Label-Farbe folgen der Measure-Farbe; Einheiten werden per `labels.format` angehängt.
  - Achse links/rechts via `opposite` je Measure.
  - Responsiveness: Bei schmalen Ansichten (Breite ≤ 320px) werden Achsen ausgeblendet, um Platz zu sparen.
- Serien: Pro Measure eine Serie vom Typ `area` mit leichter Füllung (`fillOpacity: 0.1`), `threshold: null`.
  - Tooltip: `valueDecimals: 2`, `valueSuffix` entspricht der Einheit des Measures.
  - Sichtbarkeit der Serie folgt dem `enabled`-Status des Measures.
- Navigator (Minimap): Aktiv, wenn `window.innerHeight > 600`. Die erste aktive Serie wird im Navigator angezeigt (`showInNavigator`).

Interaktion in der UI:
- Zeitspanne umschalten: Buttons 1h/24h/1w/1m rufen `setSpan()` auf → lädt alle sichtbaren Serien neu.
- Messgrößen ein-/ausblenden: Klick auf das jeweilige Icon ruft `toggleMeasure()` auf → Achsen/Serien werden neu aufgebaut und Daten ggf. nachgeladen.

Leere/fehlende Daten:
- Liefert die API keine Werte, erhält die Serie ein leeres Array; Highcharts zeigt dann entsprechend keine Linie an. Der `no-data-to-display`-Modus ist vorbereitet.

Leistung und Skalierung:
- Durch die Preset-Intervalle findet Downsampling statt, um die Punktzahl niedrig zu halten.
- Highcharts Boost-Modul ist eingebunden, um auch bei größeren Punktmengen performant zu bleiben.

Referenzen (Diagramme):
- `src/app/device/charts/charts.page.ts`
- `src/app/device/charts/charts.page.html`
- `src/app/device/charts/charts.module.ts`
- `src/app/services/data.service.ts`
