# ADR 0010: Weather source: Open-Meteo

- Status: accepted by the backend developer on 16 Nov 2026 (the lead asked the developers to decide such
  questions themselves); a new external service in the stack, so the lead confirms it in the review of the PR
- Applies to: `services/backend` (`weather`), `apps/mobile` (M19)

## Context

The app shows the weather at a field and the hours good for spraying (wind up to 4 m/s, 10 to 25 °C, no
precipitation for 6 hours). It needs a forecast for any point in Kazakhstan, hourly, for five days, and it
must stay cheap: the product is free for now. The mobile plan already named Open-Meteo.

## Decision

- **Open-Meteo** (`api.open-meteo.com`): no key, one request gives the weather now and 120 hours, wind in m/s and
  local time by the point (`wind_speed_unit=ms`, `timezone=auto`).
- **The backend calls it, not the phone.** One place for the spraying rule and the cache; the phone never talks
  to a third party with the location of a farmer's field. The call carries only the point rounded to 0.01°
  (about 1 km), no user id.
- **Cache in Redis for everyone**, per point rounded to 0.01°, for the global TTL of the cache manager
  (15 minutes). A failed call is not cached; with Redis down the call goes to the source.
- **Two limits:** 30 requests a minute per user, and 300 calls an hour to the source for all users together
  (the source allows about 10 000 a day for one address), so one account cannot use up the quota for everybody.
  After that the answer is 429 `rate_limited`.
- **The client is behind `WeatherClient`**, so changing the source touches one class.
- The spray rule (`SprayAdvisor`) lives in code, not in the database: the numbers are product constants.
  The source reports precipitation as the sum of the **preceding** hour, and the rule accounts for that.

## Consequences

- **Open-Meteo is free for non-commercial use only.** Fine for the diploma and a pilot; a paid launch needs
  their commercial plan or another source (an interface change, not a redesign). This conflicts with the wish to
  keep paid features possible later, so the lead should decide before any paid plan is sold.
- The backend needs **outbound access to `api.open-meteo.com`**: the staging and production hosts must allow it
  (task 31). Without it `/api/weather` answers 503 `weather_unavailable`.
- If the source is down the farmer gets no weather (503); there is no fallback source.
- Kazakhstan has no daylight saving time. The series is index-based with one UTC offset, so a zone with a time
  change would show an hour wrong on the change day.

## Rejected

- **Calling Open-Meteo from the phone:** no shared cache, the quota is per phone address, the rule is duplicated
  in the app, the location of the field goes to a third party from every device.
- **A paid source from the start (OpenWeatherMap, WeatherAPI):** a key to keep secret and a bill for a free
  product; Open-Meteo covers the need now.
- **Kazhydromet:** no public hourly forecast API found for arbitrary points.
