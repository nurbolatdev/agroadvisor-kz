# Weather API

`GET /api/weather?latitude=&longitude=` gives the weather for a point and the hours that are good for spraying.
It needs the role `farmer` and the feature `weather` (on the `FREE` plan since `V4`).

The client sends the point itself, from a field (`location` of `GET /api/fields/{id}`) or from the phone; the
server keeps no point of its own. A field without a point has no weather until the farmer sets one.

## Answer

| Field | Meaning |
| --- | --- |
| `timezone`, `utcOffsetSeconds` | The zone of the point. Every time below is **local to the point**, without an offset. |
| `current` | The weather now: `temperatureC`, `windMs` (m/s), `precipitationMm`, `weatherCode` ([WMO code](https://open-meteo.com/en/docs#weather_variable_documentation)). |
| `hours` | One entry per hour from the current hour to the end of the fifth day: temperature, `precipitationMm`, `precipitationProbability` (%), `windMs`, `weatherCode`, `sprayOk`. |
| `sprayWindows` | Runs of good hours as `from`–`to` (`to` is the end of the last good hour). |

## The spraying rule

An hour is good (`sprayOk`) when the wind is up to **4 m/s**, the temperature is from **10 to 25 °C**, and there
is **no precipitation for 6 hours from the start of the hour**. The precipitation of an entry is the sum of the
hour *before* its time (the way the source reports it), so for the hour starting at T the entries T+1 to T+6 are
checked. An hour with fewer than six entries after it is not good: the dry spell cannot be shown, so the last six
hours of the series are never good. The numbers are product constants and live in `SprayAdvisor`.

`precipitationProbability` and `weatherCode` of an hour are `null` when the source does not give them; the rule
does not use them.

## Errors

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | Latitude outside −90…90, longitude outside −180…180, more than 10 decimal places or 20 digits, or a missing or non-numeric one. |
| 429 | `rate_limited` | More than 30 requests per minute for one user (`app.weather.requests-per-minute`; cached answers count too), or more than 300 calls an hour to the source for all users together (`app.weather.upstream-per-hour`; only a cold cache calls it). |
| 503 | `weather_unavailable` | The source did not answer in 5 s, is busy (429/5xx) or out of reach. Try again later. |
| 502 | `weather_error` | The source answered with something we cannot use (a hole in the series, a short series, bad JSON). |

## Source and cache

The source is [Open-Meteo](https://open-meteo.com) (`app.weather.url`, `WEATHER_API_URL`): no key, wind asked in
m/s, local time (`timezone=auto`), 5 days. The forecast is cached in Redis (cache `weather`) for everyone, per point
rounded to 0.01° (about 1 km), for the global cache TTL of 15 minutes; a failed call is not cached. The spray
windows are computed on every request from the cached hours, so they always start at the current hour.

Open-Meteo is free for **non-commercial** use only (about 10 000 calls a day). A paid launch needs their paid plan
or another source: the client is behind the `WeatherClient` interface, so a change touches one class. The backend
needs outbound access to `api.open-meteo.com` (a firewall on the server must allow it). The reasons and the
rejected options are in [ADR 0010](../adr/0010-weather-source.md).
