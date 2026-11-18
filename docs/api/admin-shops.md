# Admin shops API

The admin's shop directory and the reports farmers send about it (the farmer's side is in ADR 0011 and `/api/shops`). Schemas and operation ids are in [`openapi.json`](openapi.json) (`AdminShopView`, `AdminShopRequestView`, `AdminShopStats`, `ShopBody`).

Errors are RFC 9457 problem documents with a `code` field. All endpoints are under `/api/admin/shops` and need the `ADMIN` role: no token is 401, a farmer or an agrochemist is 403.

## Endpoints

| Operation | Endpoint | Result |
| --- | --- | --- |
| `listAdminShops` | `GET /api/admin/shops?search=&regionId=&status=&page=0&size=20&lang=` | `200`, a bare array, by name (case-insensitive), then id. Hidden shops are listed. |
| `getAdminShopStats` | `GET /api/admin/shops/stats` | `200`, `{ total, active, addedThisMonth, pendingRequests }`. `addedThisMonth` counts from the start of the month (UTC). |
| `getAdminShop` | `GET /api/admin/shops/{id}?lang=` | `200`, one shop, hidden or not; 404 `shop_not_found`. |
| `createAdminShop` | `POST /api/admin/shops?lang=` | `201`, the shop, active at once. |
| `updateAdminShop` | `PUT /api/admin/shops/{id}?lang=` | `200`, the shop. Replaces every field of the body; the status is not changed. |
| `changeAdminShopStatus` | `PATCH /api/admin/shops/{id}/status?lang=` | `200`. Body `{ "status": "active" \| "hidden" }`. Repeating the status is not an error. |
| `listAdminShopRequests` | `GET /api/admin/shops/requests?status=&page=0&size=20&lang=` | `200`, a bare array, newest first. |
| `resolveAdminShopRequest` | `PATCH /api/admin/shops/requests/{id}/status?lang=` | `200`. Body `{ "status": "done" \| "rejected" }`. |

There is no delete: a shop is hidden from the app and shown again. A hidden shop is a 404 for farmers.

## Parameters of the lists

| Parameter | Rule |
| --- | --- |
| `search` | shops only, at most 100 characters; part of the name or of the address, without regard to case. `%`, `_` and `\` match literally. |
| `regionId` | shops only; the shops of that region. |
| `status` | shops: `active` or `hidden`; reports: `new`, `done` or `rejected`. Without it, all. |
| `page`, `size` | 0 to 10000 and 1 to 100, default 0 and 20. The lists have no total: read pages until one is shorter than `size`. |
| `lang` | `ru`, `kk` or `en`; it wins over `Accept-Language`; the default is `ru`. Names of regions and districts are in this language. |

A value out of range or another `status` is 400 `validation_failed`.

## Shop

```
{ "id", "name", "address", "phone", "hours", "categories", "latitude", "longitude",
  "regionId", "region", "districtId", "district", "status", "createdAt", "updatedAt" }
```

The body of `POST` and `PUT`:

| Field | Rule |
| --- | --- |
| `name`, `address` | required, trimmed, at most 120 and 255 characters, no control characters. |
| `phone`, `hours` | optional, at most 40 and 120 characters; blank is stored as null. The phone is shown only to administrators: farmers get it as text in the shop card (ADR 0011), there is no call button. |
| `categories` | optional list of `fungicides`, `insecticides`, `herbicides`, `fertilizers`, `seeds`, `equipment`; repeats are dropped, another code is 400. |
| `latitude`, `longitude` | required, a point in Kazakhstan: 40 to 56 and 46 to 88; kept with six decimals. |
| `regionId`, `districtId` | optional. A district needs its region and must lie in it; otherwise 400 `unknown_region`. |

`region` and `district` are null when not chosen. The table of districts has no rows yet, so for now only the region can be set; `districtId` works as soon as districts are added.

## Reports

```
{ "id", "type", "status", "comment", "latitude", "longitude", "shopId", "shopName",
  "author": { "id", "name", "region" }, "createdAt" }
```

- `type` is `new_shop` (a point, no shop), `wrong_info` or `closed` (a shop, no point).
- `comment` is what the farmer wrote; for a new shop it holds the name and the address as free text.
- Deciding a report only sets its status. To act on it, the admin calls the shop endpoints: `POST` for a `new_shop`, `PUT` for `wrong_info`, `PATCH .../status` with `hidden` for `closed`. The report keeps no link to the shop it led to.
- A report is decided once: a second decision is 409 `shop_request_resolved`; an unknown id is 404 `shop_request_not_found`.
- The author is not notified.

## Not returned, because the backend has no source yet

- `routes30d` (routes farmers built to a shop): the app opens an external navigator and nothing is recorded;
- coverage of districts and "districts without a shop": needs the districts and their outlines;
- `routesChangePercent`: follows from `routes30d`.

## Error codes

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | a field out of the rules above, an unknown `status`, a malformed id or body. |
| 400 | `unknown_region` | the region or the district does not exist, or the district is not in the region. |
| 401, 403 | general | no or invalid token; not an administrator. |
| 404 | `shop_not_found` | no such shop. |
| 404 | `shop_request_not_found` | no such report. |
| 409 | `shop_request_resolved` | the report is already `done` or `rejected`. |
