# API v1 reference

Every endpoint under `/api/v1`, what it takes, what it returns and how it fails. The contracts in `src/lib/api/contract/*.ts` are the source of truth; `src/lib/api/api-reference.test.ts` fails when a route is added, removed or changes its `Idempotency-Key` support without this page following. Design decisions live in the ADRs: [contracts, replay, deadlines and uploads](decisions/adr-api-contracts.md), [authentication staging](decisions/adr-api-staged-auth.md), [client UUIDs and deletion records](decisions/adr-client-uuids-are-locked-before-the-trip-lock.md), [document scope](decisions/adr-documents-have-one-scope.md). The roadmap is [plans/mobile-api.md](plans/mobile-api.md).

**Who can call it today.** Only the Arrivo web app. Requests authenticate with the Auth.js session cookie and must pass the same-origin check below, so another site or a native client cannot call it yet. App bearer tokens arrive with unified sessions (phase 6a in the plan); until then this page is for contributors and the future mobile client.

## Conventions

### Requests

| Header                 | Required                                      | Notes                                                                                                                                                |
| ---------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session cookie         | Every endpoint except `GET /api/v1/meta`      | A missing session is 401 `unauthenticated`; a session that must still enroll in MFA is 403 `mfa_enrollment_required`.                                |
| `X-Arrivo-Client: web` | Every endpoint except `GET /api/v1/meta`      | With the origin check, this is the CSRF guard. Missing or wrong: 403 `forbidden`.                                                                    |
| Same origin            | Every endpoint except `GET /api/v1/meta`      | `Sec-Fetch-Site: same-origin`, or when the browser sends no `Sec-Fetch-Site`, an `Origin` (or for a GET, `Referer`) matching the app's public URL.   |
| `Content-Type`         | Every non-GET                                 | `application/json`, or `multipart/form-data` for the three document uploads and the cover image upload. Anything else is 403 `forbidden`.            |
| `Idempotency-Key`      | Optional, only where an endpoint says **yes** | 1 to 255 characters after trimming. Sending it to an endpoint that does not accept it is 400 `bad_request`. See [Idempotency-Key](#idempotency-key). |

- **JSON bodies** must be a JSON object, including on `DELETE` (most deletes name the trip in the body, see [Deletes](#deletes)). Malformed JSON, or an array or `null`, is 400 `bad_request`. Every body is strict: an unknown field is 422 `validation_failed`.
- **GET parameters** go in the query string. A field repeated in the query is 400 `bad_request`.
- **Ids** are UUIDs and are compared case-insensitively; responses use lowercase. A malformed id in the path is 422 with the error under the parameter's name (for example `eventId`).
- **Partial updates.** `PATCH` changes only the fields sent. Where a field is listed as nullable, `null` clears it; an absent field is kept.
- **Absolute values.** Writes send the new value, never a delta, and ordering endpoints send the complete list.
- **Times** are ISO 8601 date-times: `YYYY-MM-DDTHH:mm`, optional seconds and fraction, optional `Z` or `±HH:mm`. Send an offset; a time without one is read in the server's time zone. Responses are UTC with `Z`. Dates are `YYYY-MM-DD`.
- **Text limits** count UTF-16 code units, the same as a browser `maxLength`.

### Responses

Every response carries `Cache-Control: no-store`, except `GET /api/v1/trips/:tripId` (see its `ETag`). Success is `200` with the JSON body named under each endpoint, or `204` with no body. Optional fields are omitted when empty rather than sent as `null`.

A failure is always this envelope:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Check the submitted fields.",
    "fields": { "name": ["Event name is required."] }
  }
}
```

`fields` appears only for 422 and maps a field path (nested paths joined with `.`, the whole body as `body`) to its messages. `requiredRole` appears only on a 403 for a trip role, naming the role that was needed.

| Status | `code`                    | Meaning                                                                                                                                                   |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `bad_request`             | Malformed JSON or multipart, a non-object body, a repeated query field, or an `Idempotency-Key` the endpoint does not accept.                             |
| 401    | `unauthenticated`         | No signed-in session.                                                                                                                                     |
| 403    | `forbidden`               | Failed the origin or content-type check, or the caller is a trip member without the needed role (`requiredRole` says which).                              |
| 403    | `mfa_enrollment_required` | The session is limited to MFA enrollment.                                                                                                                 |
| 404    | `not_found`               | The resource does not exist, or belongs to a trip the caller is not a member of. The two are deliberately indistinguishable.                              |
| 409    | `conflict`                | The write lost a race or would overwrite newer state: a stale order list, a reused client id with different content, a recently deleted id, a busy retry. |
| 409    | `confirmation_required`   | The write would destroy content; resend with the confirmation flag the endpoint names.                                                                    |
| 413    | `payload_too_large`       | The upload is over the endpoint's file limit.                                                                                                             |
| 422    | `validation_failed`       | A field failed validation; see `fields`.                                                                                                                  |
| 429    | `rate_limited`            | Too many requests; wait the `Retry-After` seconds.                                                                                                        |
| 500    | `server_error`            | Unexpected failure. The message is always generic.                                                                                                        |
| 503    | `deadline_exceeded`       | The write ran past its deadline and was rolled back; nothing was committed, so retrying is safe. See [Deadlines](#deadlines).                             |

### Roles

Sharing reads and invitation creation require **manager**; insufficient member roles receive 403 with `"requiredRole": "manager"`. Other trip-scoped writes need the **editor** role or above (`viewer` < `editor` < `manager`). A caller who is not a member gets 404; a viewer gets 403 with `"requiredRole": "editor"`. Access is checked again inside the write's transaction, after the trip lock, so a role removed mid-request still refuses.

### Rate limits

Per user, in fixed one-minute windows, held in the server's memory (a restart resets them):

| Bucket           | Limit   | Applies to                                              |
| ---------------- | ------- | ------------------------------------------------------- |
| `api`            | 600/min | Every endpoint except `GET /api/v1/meta`                |
| `unsplashSearch` | 30/min  | `GET /api/v1/cover-images`, on top of `api`             |
| `mapboxSearch`   | 120/min | `GET /api/v1/cover-images/destination`, on top of `api` |

### Deadlines

The server runs each request under a deadline set ahead of the web client's own timeout: 20 seconds for JSON (client 30 s) and 90 seconds for multipart (client 120 s). A write still running at its deadline is rolled back and answered 503 `deadline_exceeded`, so a request the client gave up on can never commit later. Time before the handler starts (network, queueing) is not counted.

### Idempotency-Key

Endpoints marked **`Idempotency-Key`**: yes replay a retried request instead of running it twice.

- A record belongs to the caller and the key, and remembers a fingerprint of the method, the concrete path and the validated body (object key order ignored, array order not).
- **Same request within 24 hours:** the stored response is returned, with no write and no side effects.
- **Same key, different method, path or body within 24 hours:** 409 `conflict`.
- **After 24 hours:** the request runs again.
- **Two retries at once:** the second waits up to 3 seconds for the first, then gets 409 `conflict`; retry it.
- If the write fails, nothing is recorded, so a retry with the same key can succeed.

Uploads never accept the header: retry safety for a document comes from its client `id`, and a cover upload simply replaces the cover again.

### Client ids and retries

Creates take an optional client-generated `id` (a UUID). Keep one id per draft and reuse it on every retry:

- **Same id, same content:** the stored row is returned with no write. `position` is not compared, since other inserts can shift it; the response carries the row's current position.
- **Same id, different content:** 409 `conflict`.
- **An id held by a row in a trip the caller cannot see:** 404.
- **An id whose row was deleted within the last 24 hours:** 409 `conflict`, so a retry that arrives after a delete cannot bring the row back. Mint a new id on any 409.

### Deletes

Deletes are idempotent: deleting a row that is already gone succeeds (204) once the caller is authorized for the trip. That is why most delete bodies name `tripId`: it authorizes the request even when the row no longer exists to say which trip it was in. A `tripId` that does not match the row's trip is 404.

### Ordering

Ordering endpoints replace the whole order with the list sent. The list must name exactly the items there now; a missing, extra or foreign id means the client's view is stale, and the answer is 409 `conflict` so it refreshes instead of overwriting another editor's change.

## Types

The response bodies, as defined in `src/data/types.ts`. Optional fields (`?`) are omitted when empty. Some types carry more optional fields than listed here (for example `TripEvent.docs`); these endpoints do not fill them.

```ts
interface TripEvent {
  id: string;
  tripId?: string;
  dayId?: string;
  name: string;
  note?: string;
  startAt?: string; // ISO 8601, UTC
  endAt?: string;
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  confirmationNumber?: string;
  position: number;
  createdAt?: string;
  updatedAt?: string;
}

interface DayRecord {
  id: string;
  tripId: string;
  dayNumber: number; // 1-based
  date?: string; // YYYY-MM-DD, when the trip has dates
  label: string;
  subtitle?: string;
  weather?: string;
  travelSummary?: string;
}

interface DayItemOrder {
  dayId: string;
  items: { type: "event" | "note" | "checklist"; id: string }[];
}

interface Note {
  // a note on a day's timeline
  id: string;
  tripDayId: string;
  position: number;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

interface TripNote {
  // a note on the trip's Notes tab
  id: string;
  tripId: string;
  position: number;
  title?: string;
  body?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface TripNoteOrder {
  tripId: string;
  noteIds: string[];
}

interface Checklist {
  id: string;
  tripDayId: string;
  position: number;
  title?: string;
  items: ChecklistItem[];
  createdAt?: string;
  updatedAt?: string;
}

interface ChecklistItem {
  id: string;
  checklistId: string;
  content: string;
  isChecked: boolean;
  createdAt?: string;
}

interface Document {
  id: string;
  name: string;
  kind: "pdf" | "image" | "doc";
  size?: string; // display string, e.g. "1.2 MB"
  scope: "trip" | "event" | "reservation";
  url?: string;
  addedAt?: string;
}

interface CoverImageSearchResult {
  id: string;
  url: string;
  photographer: string;
  photographerUrl?: string;
  alt: string;
}
```

## Metadata

### GET /api/v1/meta

**Auth** none · **`Idempotency-Key`** no · **Success** `200`

The one public endpoint, so a client can discover the API before signing in. It skips the session, origin and rate-limit checks and reveals no version, user or environment data.

```json
{ "apiVersion": 1, "capabilities": ["idempotency-key", "sharing-invitations"] }
```

## Trips

### POST /api/v1/trips

**Auth** signed in · **`Idempotency-Key`** yes · **Success** `200` `Trip`

Creates a trip owned by the caller, who becomes its manager and creator. Body (strict): `id` (a client-chosen UUID, required), `name` (required), and optionally `startDate`, `endDate`, `destinationName`, `destinationCountry`, `destinationCountryCode`, `destinationCenter` (`[longitude, latitude]`, used only to pick the cover), `notes`, `budgetTotal`, `budgetCurrency`, `tags` and `transitMode`. Field limits match the web trip form. `coverImageUrl` and other cover fields are rejected: the server picks the cover (see below). A missing `budgetCurrency` defaults to the account's currency, then to one derived from `Accept-Language`; a missing `transitMode` defaults to the account's, then `drive`. Dates are `YYYY-MM-DD`; a trip gets one day per date, or a single dateless Day 1 without a `startDate`. A range over 45 days or an `endDate` before the `startDate` returns 422 `validation_failed` and writes nothing.

Repeating the same `id` with the same content returns the current trip without writing, recording activity or touching the cover, whatever `Idempotency-Key` it carries. Content means every field sent, plus the dates, destination, notes, budget and tags being absent when not sent; currency and transit mode count only when sent, tags compare in order, and `destinationCenter` and the cover never count. The same `id` with different content returns 409 `conflict`, an `id` that belongs to a trip the caller cannot see returns 404 `not_found`, and the `id` of a trip deleted within the last 24 hours returns 409 `conflict` and creates nothing; mint a new `id`. A keyed replay returns the stored response, which is the trip as it was when created, before its cover was set; a retry by `id` returns the current row, cover included. The generated cover only fills an empty cover: one chosen while it was generating is kept, and a map tile fetch that takes longer than 5 seconds leaves the trip without a cover.

**Cover.** After the trip commits, the server sets a cover the way the account's default cover type asks: a built-in graphic (always, when no destination is given), a Mapbox map tile saved to storage, or the first photo search result with its photographer credit. This runs once, when the row is first created. A failed lookup is logged and the trip keeps no cover; it never fails the create. Change it later with `PUT /api/v1/trips/:tripId/cover`.

### GET /api/v1/trips

**Auth** signed in · **`Idempotency-Key`** no · **Success** `200` `{ trips: TripListEntry[] }`

No query fields. Returns every trip the caller owns or is a member of, ordered by start date (dateless trips first) then name. Each entry is `{ trip, todayEvents, summaryEvents }`, the shape the trips page reads, with `trip.status` (`active`, `upcoming` or `past`) computed from the server clock at read time. Trips the caller is not on never appear.

## Days

### POST /api/v1/trips/:tripId/days

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `DayRecord`

Appends a day after the trip's last day, labelled `Day N`, dated the day after the last one when the trip has dates (the trip's end date moves to it).

| Field | Type | Notes                          |
| ----- | ---- | ------------------------------ |
| `id`  | UUID | Optional client id for retries |

409 when the trip has no days or its day order is inconsistent; 422 when the trip already has 45 days.

### PATCH /api/v1/days/:dayId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `DayRecord`

| Field           | Type                    | Notes             |
| --------------- | ----------------------- | ----------------- |
| `label`         | string, ≤ 100           | Cannot be cleared |
| `subtitle`      | string ≤ 300, or `null` | `null` clears     |
| `weather`       | string ≤ 300, or `null` | `null` clears     |
| `travelSummary` | string ≤ 300, or `null` | `null` clears     |

### DELETE /api/v1/days/:dayId

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Removes the trip's last day; the trip's end date moves back to the previous day's date when it has one. The day's events, notes, checklists and event documents go with it.

| Field                | Type    | Notes                                                           |
| -------------------- | ------- | --------------------------------------------------------------- |
| `tripId`             | UUID    | Required                                                        |
| `confirmDestructive` | boolean | Required as `true` when the day has events, notes or checklists |

409 `conflict` when the day is not the last one or is the only one left; 409 `confirmation_required` when the day has content and `confirmDestructive` is not `true`.

### PUT /api/v1/days/:dayId/order

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `DayItemOrder`

Replaces the day's timeline order. See [Ordering](#ordering).

| Field   | Type                                                      | Notes                                                             |
| ------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `items` | array of `{ type: "event" \| "note" \| "checklist", id }` | Every item on the day, first to last; at most 500, each once only |

## Events

### POST /api/v1/days/:dayId/events

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `TripEvent`

| Field                | Type                | Notes                                      |
| -------------------- | ------------------- | ------------------------------------------ |
| `id`                 | UUID                | Optional client id for retries             |
| `name`               | string, 1–200       | Required, not blank                        |
| `startAt`, `endAt`   | date-time, or `""`  | `""` means no time                         |
| `locationName`       | string, ≤ 200       |                                            |
| `locationAddress`    | string, ≤ 300       |                                            |
| `locationLat`        | number, −90 to 90   |                                            |
| `locationLng`        | number, −180 to 180 |                                            |
| `confirmationNumber` | string, ≤ 64        |                                            |
| `note`               | string, ≤ 5000      |                                            |
| `afterEventId`       | UUID                | Place directly after this event on the day |
| `insertAtPosition`   | integer, 0–10000    | Used when `afterEventId` is absent         |

With neither placement field, the event is appended. Fields can be omitted but not `null`. 409 when the day moved to another trip since the client loaded it.

### PATCH /api/v1/events/:eventId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `TripEvent`

Takes the same fields and limits as the create, except `id` and the placement fields. Every field except `name` accepts `null` to clear it (`""` also clears `startAt` and `endAt`); `name` can be changed but not cleared. Events shown on the itinerary from a reservation (ids starting `linked-`) are not events and cannot be edited here.

### DELETE /api/v1/events/:eventId

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

| Field           | Type    | Notes                                                                                                |
| --------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `tripId`        | UUID    | Required                                                                                             |
| `keepDocuments` | boolean | `true` keeps the event's documents as trip documents; absent or `false` deletes them and their files |

## Day notes

Notes on a day's timeline. For notes on the trip's Notes tab, see [Trip notes](#trip-notes).

### POST /api/v1/days/:dayId/notes

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `Note`

| Field              | Type             | Notes                          |
| ------------------ | ---------------- | ------------------------------ |
| `id`               | UUID             | Optional client id for retries |
| `content`          | string, ≤ 5000   | Required                       |
| `insertAtPosition` | integer, 0–10000 | Absent appends to the day      |

409 when the day moved to another trip since the client loaded it.

### PATCH /api/v1/itinerary-notes/:noteId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `Note`

| Field     | Type           | Notes    |
| --------- | -------------- | -------- |
| `content` | string, ≤ 5000 | Required |

### DELETE /api/v1/itinerary-notes/:noteId

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Body: `{ "tripId": "<uuid>" }`.

## Checklists

### POST /api/v1/trips/:tripId/checklists

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `Checklist`

| Field       | Type                                               | Notes                                                                                        |
| ----------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `dayId`     | UUID                                               | Required; a day of this trip                                                                 |
| `position`  | integer, 0–10000                                   | Required                                                                                     |
| `id`        | UUID                                               | Optional client id for retries                                                               |
| `title`     | string, ≤ 200                                      |                                                                                              |
| `firstItem` | `{ id?: UUID, content: string }`                   | Creates the checklist with one item; `content` is trimmed, 1–300                             |
| `source`    | `{ type: "template" \| "packing-list", id: UUID }` | Copies the title and items from one of the caller's templates or a packing list on this trip |

`source` cannot be combined with `title` or `firstItem` (422 under `source`). An unknown template or packing list is 404.

### PATCH /api/v1/checklists/:checklistId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `Checklist`

| Field   | Type                    | Notes                          |
| ------- | ----------------------- | ------------------------------ |
| `title` | string ≤ 200, or `null` | Required key; `null` clears it |

### DELETE /api/v1/checklists/:checklistId

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Body: `{ "tripId": "<uuid>" }`. The checklist's items go with it.

### POST /api/v1/checklists/:checklistId/items

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `ChecklistItem`

| Field     | Type          | Notes                               |
| --------- | ------------- | ----------------------------------- |
| `id`      | UUID          | Optional client id for retries      |
| `content` | string, 1–300 | Required; trimmed before the checks |

### PATCH /api/v1/checklist-items/:itemId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `ChecklistItem`

| Field       | Type          | Notes                     |
| ----------- | ------------- | ------------------------- |
| `content`   | string, 1–300 | Trimmed before the checks |
| `isChecked` | boolean       |                           |

### DELETE /api/v1/checklist-items/:itemId

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Body: `{ "tripId": "<uuid>" }`.

## Packing items

### POST /api/v1/trips/:tripId/packing-items

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `PackingItem`

Editor access required. Body: `{ "id": "<uuid>", "name": "Boots", "listId": null, "isLabel": false, "labelId": null, "beforeItemId": "<uuid>" }`. `name` is trimmed and must contain 1–30 characters after trimming. A named list uses its UUID; null selects the default list. `isLabel`, `labelId`, and one of `beforeItemId` or `afterItemId` are optional. Labels cannot have a parent, and the list, section, and anchor must belong to the same trip and list. Without an anchor the item is appended. Returns the created item (200). A compatible client UUID replay returns the existing item without changing order; conflicting content returns 409. The `id` of an item or section deleted within the last 24 hours (directly, or with its section) returns 409 `conflict` and creates nothing. Invalid input or scope returns 422.

### DELETE /api/v1/packing-items/:itemId/section

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Editor access required. Body: `{ "tripId": "<uuid>", "mode": "delete-items" | "move-items-to-ungrouped" }`. Deletes the section and either deletes its items or moves them to ungrouped. Returns 204, including for a missing section after authorization. Foreign or non-section items return 404. Both endpoints support `Idempotency-Key` and recheck access on replay.

### PATCH /api/v1/packing-items/:itemId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `PackingItem`

The item ID must be a UUID. Accepts a strict partial body with optional `name` (string, trimmed, 1–30 characters) and `isPacked` (boolean). Both fields apply to section labels as well as ordinary items. Returns the mapped item with `id`, `tripId`, `listId`, `name`, `done`, `position`, `isLabel` and `labelId`; `done` reflects `isPacked`. An empty or unchanged patch writes nothing. Repeating an absolute state does not toggle it. Invalid UUIDs, unknown fields and invalid names return validation errors. Viewers receive 403 and non-members receive 404. Keyed replay rechecks current access.

### DELETE /api/v1/packing-items/:itemId

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Body: `{ "tripId": "<uuid>" }`. An absent item still returns 204 after trip authorization; an item on another trip returns 404. Deleting a section label ungroups its child items by clearing their `labelId`; it does not delete them. Invalid UUIDs, unknown fields and invalid names return validation errors. Viewers receive 403 and non-members receive 404. Keyed replays recheck current access before returning a cached response.

### POST /api/v1/trips/:tripId/packing/pull-templates

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `{ added, skipped }`

Requires editor access. Body: `{ "templateIds": ["<uuid>"], "listId": "<uuid>" }`; `listId` may be omitted or null for the default list. Only templates owned by the caller are considered; missing and foreign IDs are ignored. Repeated IDs are processed once. Names are trimmed and compared case-insensitively within the destination list; duplicate items and sections count as skipped, and children map to matching sections. Returns `{ "added": 0, "skipped": 0 }` counts. An invalid list returns a validation error; inaccessible trips follow the standard 403/404 rules. An `Idempotency-Key` replays the original result after access is rechecked and does not repeat writes or effects; a fresh repeat counts existing names as skipped.

### PUT /api/v1/trips/:tripId/packing/order

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `{ listId, items }`

Replaces the complete order of one packing list. Body: `{ "listId": "<uuid>" | null, "items": [{ "id": "<uuid>", "labelId": "<uuid>" | null }] }`. `listId: null` is the default list. `items` must name every item and section label the list holds right now, each once, at most 1000; the position is the array index, and `labelId` places an item in a section (a label row of the same list) or ungroups it with `null`. Section labels themselves are listed with `labelId: null`. Unknown fields are rejected.

The response echoes the saved `listId` and `items`, so clients need no refetch. A list already stored in that order and grouping writes nothing and records no activity.

A stale, partial, extra or foreign list (an `id` that is not currently in that list of this trip) returns 409 `conflict` and writes nothing, so the client reloads instead of overwriting another editor's change. A `labelId` that is not a section of the same list, or a label given a `labelId`, returns 422 `validation_failed`. Invalid UUIDs, duplicate ids, a missing `listId`, oversize lists and unknown fields also return 422. Viewers receive 403 and non-members receive 404. Keyed replays recheck current access before returning a cached response.

## Packing lists

Named packing lists on a trip. The default list is not a row and has no endpoint.

### POST /api/v1/trips/:tripId/packing-lists

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `TripPackingList`

Body: `{ "id": "<uuid>", "name": "Carry-on" }`. `name` is trimmed and must contain 1–30 characters after trimming. The list is appended after the last list of the trip. Repeating the same `id` with the same trip and name returns the existing list without writing, recording activity or publishing an event; the same `id` with another name or trip returns 409 `conflict`, as does the `id` of a list deleted within the last 24 hours. A blank or over-length name returns 422. Viewers receive 403 and non-members receive 404. Keyed replays recheck current access.

### PATCH /api/v1/packing-lists/:listId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `TripPackingList`

Body: `{ "tripId": "<uuid>", "name": "Checked bag" }`, with the same name rules as create. An unchanged name writes nothing. A missing list, or a list on another trip, returns 404. Viewers receive 403 and non-members receive 404.

### DELETE /api/v1/packing-lists/:listId

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Body: `{ "tripId": "<uuid>" }`. Deletes the list and every item and section in it; other lists and the default list are untouched. An absent list still returns 204 after trip authorization; a list on another trip returns 404. Viewers receive 403 and non-members receive 404.

## Packing templates

### POST /api/v1/packing-templates

**Auth** signed in � **`Idempotency-Key`** yes � **Success** `200` `PackingTemplate`

Creates a packing template owned by the caller. Body (strict): `id` (a client-chosen UUID, required) and `name` (required, trimmed, at most 30 characters). A blank or over-limit name returns 422 `validation_failed` and writes nothing.

Repeating the same `id` with the same name returns the current template without writing, whatever `Idempotency-Key` it carries. The same `id` with a different name returns 409 `conflict`; an `id` that belongs to another user's template returns 404 `not_found` and reveals nothing about it. A keyed replay returns the stored response only while the template remains owned by the caller; after deletion it returns 404.

### GET /api/v1/packing-templates

**Auth** signed in � **`Idempotency-Key`** no � **Success** `200` `{ templates: PackingTemplate[] }`

No query fields. Returns only the caller's templates, ordered by name (case-insensitive), then creation time.

### GET /api/v1/packing-templates/:templateId

**Auth** signed in · **`Idempotency-Key`** no · **Success** `200` `{ template: PackingTemplate, items: PackingTemplateItem[] }`

Returns the caller's template and its items in order. Missing or foreign templates return 404.

### PATCH /api/v1/packing-templates/:templateId

**Auth** signed in · **`Idempotency-Key`** yes · **Success** `200` `PackingTemplate`

Body: `{ "name": "Beach" }`, with the same name rules as create. Missing or foreign templates return 404. A keyed replay after deletion returns 404.

### DELETE /api/v1/packing-templates/:templateId

**Auth** signed in · **`Idempotency-Key`** no · **Success** `204`

Body: `{}`. Deletes the caller's template and its items. Missing and foreign templates also return 204.

### PUT /api/v1/packing-templates/:templateId/order

The requested item sequence is stored as flat positions, including interleaved sections and items. The editor groups items under their `labelId` heading and sorts headings and each group by position, followed by ungrouped items; its display can therefore differ from the flat API sequence.

**`Idempotency-Key`** yes

Replaces the complete template order and section assignments. Send `{ "items": [{ "id": "uuid", "labelId": null }], "expectedItems": [{ "id": "uuid", "position": 0, "labelId": null }] }`; array indices determine desired positions. `expectedItems` must match the last confirmed positions and sections exactly, including gaps and ties. A changed snapshot returns 409 `conflict`. Every stored item and section must appear exactly once. Missing, extra, or foreign item IDs return 409 `conflict`; duplicate IDs or invalid section assignments return 422. Unknown or foreign templates return 404. Supports `Idempotency-Key`. See [Ordering](#ordering).

### POST /api/v1/packing-templates/:templateId/items

**Auth** signed in · **`Idempotency-Key`** yes · **Success** `200` `PackingTemplateItem`

Adds an item or section to a template the caller owns. Body (strict): `id` (a client-chosen UUID, required), `text` (required, trimmed, 1-30 characters), and optional `isLabel`, `labelId` and one of `beforeItemId` or `afterItemId`. Without an anchor the item goes last; an anchor inserts it directly before or after that item in the flat order and shifts later items down. The anchor may belong to a different section from the requested `labelId`; membership follows `labelId`. `labelId` must be a section of the same template, and sections cannot have a parent. Returns the created item. Repeating the same `id` with the same content returns the current item without writing, whatever `Idempotency-Key` it carries; the same `id` with different content returns 409 `conflict`. The `id` of an item or section deleted within the last 24 hours returns 409 and is not recreated. A missing or foreign template, or an `id` that belongs to another user's template, returns 404 `not_found`. A `labelId` or anchor that is not in this template returns 422 `validation_failed` and writes nothing.

### PATCH /api/v1/packing-template-items/:itemId

**Auth** signed in · **`Idempotency-Key`** yes · **Success** `200` `PackingTemplateItem`

Body (strict): `{ "text": "Cap" }`, trimmed, 1-30 characters. Applies to items and sections. A missing item or one in another user's template returns 404.

### DELETE /api/v1/packing-template-items/:itemId

**Auth** signed in · **`Idempotency-Key`** yes · **Success** `204`

Body: `{}`. Deletes the item and remembers its id for 24 hours. A missing item, and an item in another user's template, also return 204 and write nothing. Deleting a section this way leaves its items in place, ungrouped; use the section endpoint to choose.

### DELETE /api/v1/packing-template-items/:itemId/section

**Auth** signed in · **`Idempotency-Key`** yes · **Success** `204`

Body: `{ "mode": "delete-items" | "move-items-to-ungrouped" }`. Removes the section and either deletes its items or moves them to ungrouped. The removed ids cannot be recreated for 24 hours. An item that is not a section returns 404; a missing section, and one in another user's template, return 204 and write nothing.

### POST /api/v1/packing-lists/:listId/template

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `PackingTemplate`

Saves one packing list as a template owned by the caller. Body (strict): `tripId` (the list's trip, required), `id` (a client-chosen UUID for the template, required) and `name` (required, trimmed, at most 30 characters). Only that list's items are copied, in order, with each item's section link rebuilt inside the template and every item unchecked. Items of other lists, the default list and other trips are never copied; the list itself is unchanged.

A blank or over-limit name returns 422 `validation_failed`, as does a list with no items; nothing is written. A caller below editor gets 403 `forbidden` (404 `not_found` with no access to the trip); a list that does not exist or is in another trip returns 404 `not_found`. Repeating the same `id` with the same name returns the current template without a second copy, whatever `Idempotency-Key` it carries. The same `id` with a different name returns 409 `conflict`; an `id` that belongs to another user's template returns 404 `not_found`. A keyed replay rechecks trip access and template ownership; after template deletion it returns 404.

## Trip notes

Notes on the trip's Notes tab.

### POST /api/v1/trips/:tripId/notes

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `TripNote`

Adds the note at the top of the list.

| Field   | Type            | Notes                          |
| ------- | --------------- | ------------------------------ |
| `id`    | UUID            | Optional client id for retries |
| `title` | string, ≤ 200   |                                |
| `body`  | string, ≤ 10000 |                                |

At least one of `title` and `body` must have non-blank text. A blank field is stored as no value.

### PATCH /api/v1/notes/:noteId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `TripNote`

| Field   | Type                      | Notes                  |
| ------- | ------------------------- | ---------------------- |
| `title` | string ≤ 200, or `null`   | `null` or blank clears |
| `body`  | string ≤ 10000, or `null` | `null` or blank clears |

Send at least one of the two.

### DELETE /api/v1/notes/:noteId

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Body: `{ "tripId": "<uuid>" }`.

### PUT /api/v1/trips/:tripId/notes/order

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `TripNoteOrder`

Replaces the order of the trip's notes. See [Ordering](#ordering).

| Field     | Type          | Notes                                                              |
| --------- | ------------- | ------------------------------------------------------------------ |
| `noteIds` | array of UUID | Every note on the trip, first to last; at most 500, each once only |

## Documents

A document belongs to exactly one scope: the trip, one event or one reservation.

Uploads are `multipart/form-data` with exactly one file part named `file` and the optional string field `id`. Any other field, a repeated field or a second file is 400 `bad_request`; no file is 422 under `file`. Files up to 25 MB, of type PDF, JPEG, PNG, WebP, HEIC or HEIF; the server checks the content, not only the declared type, and a refused file is 422 under `file`. A larger body is 413 `payload_too_large`, refused from `Content-Length` before it is read.

Retrying an upload: keep one client `id` per chosen file. The same id with the same file (same name, kind and size) returns the stored document without storing the file twice; see [Client ids and retries](#client-ids-and-retries).

### POST /api/v1/trips/:tripId/documents

**Role** editor · **`Idempotency-Key`** no · **Success** `200` `Document`

Uploads a trip-scope document.

### POST /api/v1/events/:eventId/documents

**Role** editor · **`Idempotency-Key`** no · **Success** `200` `Document`

Uploads a document attached to the event. Reservation-linked itinerary entries (`linked-` ids) are refused; attach to the reservation instead.

### POST /api/v1/reservations/:reservationId/documents

**Role** editor · **`Idempotency-Key`** no · **Success** `200` `Document`

Uploads a document attached to the reservation.

### PATCH /api/v1/documents/:documentId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `Document`

Renames a document or moves it to another scope in the same trip.

| Field           | Type           | Notes                                                     |
| --------------- | -------------- | --------------------------------------------------------- |
| `name`          | string, 1–200  | Not blank                                                 |
| `eventId`       | UUID or `null` | Attach to this event; `null` moves it to trip scope       |
| `reservationId` | UUID or `null` | Attach to this reservation; `null` moves it to trip scope |

Send at most one of `eventId` and `reservationId` (both, even both `null`, is 422). Setting one clears the other link. A target in another trip is 404.

### DELETE /api/v1/documents/:documentId

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Body: `{ "tripId": "<uuid>" }`. The stored file is removed after the delete commits.

## Trip cover

### PUT /api/v1/trips/:tripId/cover

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Sets the cover to an image URL, typically a result from [cover image search](#get-apiv1cover-images).

| Field                  | Type                     | Notes                                                                                          |
| ---------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| `coverImageUrl`        | string                   | Required. An `http(s)` URL, a built-in graphic or map cover, or this trip's own uploaded cover |
| `coverPhotographer`    | string 1–200, or `null`  | Attribution; trimmed                                                                           |
| `coverPhotographerUrl` | `http(s)` URL, or `null` | Attribution link                                                                               |

### POST /api/v1/trips/:tripId/cover/image

**Role** editor · **`Idempotency-Key`** no · **Success** `204`

Uploads a custom cover and clears the attribution. Multipart with one part named `file` and no other fields; up to 12 MB of JPEG, PNG, WebP, HEIC, HEIF, GIF or AVIF. A retry stores a fresh file and replaces the cover again.

### DELETE /api/v1/trips/:tripId/cover

**Role** editor · **`Idempotency-Key`** yes · **Success** `204`

Removes the cover. Body: `{}`.

## Cover images

Search helpers for the cover picker. Any signed-in user can call them; they do not touch a trip.

### GET /api/v1/cover-images

**Auth** signed in · **`Idempotency-Key`** no · **Success** `200` `{ images: CoverImageSearchResult[] }`

Searches Unsplash.

| Query     | Type          | Notes             |
| --------- | ------------- | ----------------- |
| `query`   | string, 1–200 | Required; trimmed |
| `page`    | integer, 1–50 | Default 1         |
| `perPage` | integer, 1–30 | Default 19        |

500 when the server has no `UNSPLASH_ACCESS_KEY` or Unsplash fails.

### GET /api/v1/cover-images/destination

**Auth** signed in · **`Idempotency-Key`** no · **Success** `200` `{ center: [longitude, latitude] | null }`

Geocodes a destination name, for a map cover. `center` is `null` when nothing matches, the lookup fails, or the server has no Mapbox token.

| Query  | Type          | Notes             |
| ------ | ------------- | ----------------- |
| `name` | string, 1–200 | Required; trimmed |

## Sharing

### GET /api/v1/trips/:tripId/collaborators

**Role:** manager. **`Idempotency-Key`**: no.

No query fields. Returns `{ collaborators, currentCollaboratorId, invitations }` using existing collaborator and invitation shapes. Invitations include pending (including expired pending) and declined rows. Nonmembers receive 404; viewers and editors receive 403.

Response fields:

| Field                   | JSON type                 | Presence and nullability                                                                  |
| ----------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `collaborators`         | collaborator object array | Always present; empty array allowed.                                                      |
| `currentCollaboratorId` | UUID string or `null`     | Always present; caller's collaborator row ID, or `null` when no matching row is returned. |
| `invitations`           | invitation object array   | Always present; empty array allowed.                                                      |

Each collaborator object contains the mapped fields below. Optional fields are omitted when unavailable; they are never returned as `null`.

| Field       | JSON type                              | Presence                                                         |
| ----------- | -------------------------------------- | ---------------------------------------------------------------- |
| `id`        | UUID string                            | Always present in this endpoint.                                 |
| `name`      | string                                 | Always present; display name stored on membership.               |
| `initials`  | string                                 | Always present.                                                  |
| `role`      | `"viewer"`, `"editor"`, or `"manager"` | Always present.                                                  |
| `isCreator` | boolean                                | Always present in this endpoint.                                 |
| `username`  | string                                 | Optional; omitted after the linked account is deleted.           |
| `image`     | string                                 | Optional; profile image URL, omitted without a photo or account. |
| `tintBg`    | string                                 | Optional; stored background color token.                         |
| `tintFg`    | string                                 | Optional; stored foreground color token.                         |

Each invitation object contains these fields. This read returns only `pending` and `declined` statuses; expired pending invitations still have `status: "pending"` and an `expiresAt` in the past.

| Field             | JSON type                              | Presence and nullability                               |
| ----------------- | -------------------------------------- | ------------------------------------------------------ |
| `id`              | UUID string                            | Always present; never null.                            |
| `tripId`          | UUID string                            | Always present; never null.                            |
| `inviteeUsername` | string                                 | Always present; never null.                            |
| `role`            | `"viewer"`, `"editor"`, or `"manager"` | Always present; never null.                            |
| `status`          | `"pending"` or `"declined"`            | Always present; never null.                            |
| `expiresAt`       | ISO 8601 date-time string              | Always present; never null.                            |
| `invitedBy`       | UUID string                            | Always present; inviter account ID, never null.        |
| `createdAt`       | ISO 8601 date-time string              | Optional; omitted when database creation time is null. |

### PATCH /api/v1/trips/:tripId/collaborators

**Role:** manager. **`Idempotency-Key`**: yes.

Applies a batch of contributor role changes and removals all-or-nothing in one transaction. Returns `200` `{ status: "success" }`. An empty `changes` array is a no-op that also returns `200` and publishes nothing.

Body: `{ changes: Change[] }`, at most 50 changes, each naming a different `collaboratorId`.

| Change field     | JSON type                              | Notes                                                                         |
| ---------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `type`           | `"role"` or `"remove"`                 | Required.                                                                     |
| `collaboratorId` | UUID string                            | Required; collaborator row ID from the GET above. Must appear once per batch. |
| `fromRole`       | `"viewer"`, `"editor"`, or `"manager"` | Required for `"role"`; the role the client saw. Not allowed on `"remove"`.    |
| `toRole`         | `"viewer"`, `"editor"`, or `"manager"` | Required for `"role"`; the new role. Not allowed on `"remove"`.               |

Errors, with no change applied in any case:

| Status | Code                | When                                                                                                                                                                                                                   |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 422    | `validation_failed` | More than 50 changes, a repeated `collaboratorId`, an unknown field, type or role, a malformed UUID, or a change targeting the trip creator or the caller.                                                             |
| 409    | `conflict`          | Stale batch: a `fromRole` no longer matches, a target left the trip (or belongs to another), or the trip was deleted. Reload the collaborators and stage again. Also a reused `Idempotency-Key` with a different body. |
| 403    | `forbidden`         | Caller is an editor or viewer, including a manager demoted while the request waited for the trip lock.                                                                                                                 |
| 404    | `not_found`         | Caller is not on the trip.                                                                                                                                                                                             |
| 503    | `deadline_exceeded` | The request deadline passed; writes and the saved replay roll back together.                                                                                                                                           |

The trip row is locked, then manager authority is rechecked, then any saved `Idempotency-Key` response is read, all in one transaction, so a demoted manager never sees a saved response. A retry with the same key and body returns the saved `{ status: "success" }` without applying changes or publishing events again. After commit, each removed user receives a membership-removed event on their personal channel and loses their trip-channel subscriptions, each re-roled user receives a membership-changed event, and the trip channel receives one membership-changed event. Rolled-back and replayed requests publish nothing. Batches record no activity. No schema migration or new configuration is required.

### GET /api/v1/users/invitable

**Role:** manager on query `tripId` (required UUID). **`Idempotency-Key`**: no.

Returns `{ users: [{ id, username }], hasOtherUsers }`. Users are sorted by case-insensitive username. Excludes caller, accounts without passwords, existing collaborators, and all pending invitations including expired ones. `hasOtherUsers` reports whether any other account exists, independently of picker eligibility.

### POST /api/v1/trips/:tripId/invitations

**Role:** manager. **`Idempotency-Key`**: yes.

Body: `{ id?: UUID, username: string, role?: "viewer" | "editor" | "manager" }`. Usernames are trimmed, lowercased and validated against account username rules; role defaults to viewer. Returns `{ status: "invited" }`, `{ status: "resent" }`, or typed domain rejection `{ status: "error", message, errorCode }` (`no-account`, `self-invite`, `already-collaborator`, `invite-conflict`). Malformed fields receive 422. Insufficient membership receives 403; nonmembership receives 404. Manager authority is rechecked under user-before-trip locks before reading any saved response.

A new intent against an existing pending invitation preserves its row ID and refreshes role and expiry (72 hours), including when pending expiry has passed. Declined rows are replaced; rescinded rows remain retired. Successful writes publish invitee dashboard and trip membership events only after commit. Fresh creates record invitation activity once; resends and retries do not duplicate creation activity.

UUID intent evidence and keyed responses commit atomically with invitation changes and share existing 24-hour replay-storage retention. The fingerprint includes validated UUID, normalized username, role, method and concrete trip path. Evidence remembers the actual pending row ID when a fresh UUID aliases an existing pending invitation. Exact UUID retries while that row remains pending return saved success without refreshing expiry, changing role, recording activity or publishing events, even with an independent header key or no header. Changed recipient, trip, role or actor conflicts with 409; foreign inaccessible trips remain concealed as 404.

After rescind, dismissal, acceptance or decline, the same header key still returns saved success within retention after current manager authorization. A new key or absent header reusing that retired UUID receives 409 and cannot revive it, even if its row was deleted or replaced. A fresh intent must use a fresh UUID. Clients retain UUID on an uncertain network/timeout retry and replace it when trip, recipient or role changes or after successful completion. Without UUID or header, repeated requests are independent resend intents. After retention expires, replay protection is no longer guaranteed: send a fresh UUID for fresh intent. No schema migration or new configuration is required.

### POST /api/v1/invitations/:invitationId/accept

**Role:** the invited account (no trip membership needed). **`Idempotency-Key`**: yes.

Empty body (`{}`). Returns `{ status: "accepted", tripId }` and adds the caller to the trip as a collaborator with the invited role. An invitation addressed to another account, or one that does not exist, receives 404 `not_found` and changes nothing; the two cases are indistinguishable. A rescinded, accepted or declined invitation receives 409 `conflict` with the reason as `message` ("This invitation was rescinded by the trip owner." or "This invitation is no longer pending."); an expired one receives 409 "This invitation has expired.", judged on the database clock. A deleted account or trip receives 404.

The caller's account and the trip are locked, user before trip, and the invitation is rechecked as addressed to the caller before any saved response is read. Accepting records invitation activity and publishes trip and invitee membership events and the invitee's invitation-badge event only after commit; a keyed retry returns the saved result without a second membership write, activity or events. The fingerprint includes method and concrete path, so a key reused on another invitation or on decline conflicts with 409. A keyed retry after a manager dismisses the accepted row receives 404, because the caller no longer has a row addressed to them.

### POST /api/v1/invitations/:invitationId/decline

**Role:** the invited account (no trip membership needed). **`Idempotency-Key`**: yes.

Empty body (`{}`). Returns `{ status: "declined" }`. Authorization, 404 and 409 behavior, locking, replay and the after-commit events match accept, except that declining records no activity and creates no membership.

### POST /api/v1/invitations/:invitationId/resend

**Role:** manager of the supplied trip. **`Idempotency-Key`**: yes.

Body: `{ "tripId": "<uuid>" }`. Refreshes a pending invitation's expiry to 72 hours from now, including an expired pending invitation. Returns `{ "status": "success", "expiresAt": "<ISO 8601>" }`.

### POST /api/v1/invitations/:invitationId/dismiss

**Role:** manager of the supplied trip. **`Idempotency-Key`**: yes.

Body: `{ "tripId": "<uuid>" }`. Deletes a non-pending invitation and returns `{ "status": "success" }`.

### DELETE /api/v1/trips/:tripId/invitations/:invitationId

**Role:** manager. **`Idempotency-Key`**: yes.

Body: `{}`. Rescinds a pending invitation and returns `{ "status": "success" }`.

These operations return 404 for unknown or other-trip invitations and 409 for a conflicting invitation state. Nonmembers receive 404 and editors and viewers receive 403. Current manager authorization is checked before replay lookup; a keyed retry returns the saved response without repeated effects, including after dismissal deletes the row. Reusing a key with another path or body returns 409.

### DELETE /api/v1/trips/:tripId/collaborators/me

**Role:** none required; identity comes from the session. **`Idempotency-Key`**: yes. **Success** `204`

Body: `{}`. Removes the caller's own editor or viewer membership and leaves the trip, its content and every other membership intact. The response is an identical empty `204` whether the caller left now, had already left, was never on the trip, or the trip does not exist, so the endpoint reveals nothing about trips the caller is not on. An absent membership skips replay lookup and storage entirely, even when the key was used before.

A creator or manager is refused with 422 `validation_failed` ("The trip creator can't leave this trip." or "Managers can't leave a trip.") and keeps their membership; a manager must be demoted first. A reused `Idempotency-Key` with a different request returns 409 while the membership exists; 503 `deadline_exceeded` rolls back the removal and its saved replay together.

The trip row is locked, then the caller's membership and role are rechecked, then any saved response is read, all in one transaction. A keyed retry returns `204` without repeating effects, and cannot remove a membership the caller regained later: leave again with a fresh key. After commit the caller receives a membership-left event on their personal channel and loses their trip-channel subscriptions, then the trip channel receives a membership-changed event; the trip and trips list are revalidated. No-op, rolled-back and replayed requests publish nothing. No schema migration or new configuration is required.

### GET /api/v1/trips/:tripId

**Role** viewer · **`Idempotency-Key`** no · **Success** `200` `TripDetailPayload`, or `304`

No query fields. Returns the whole trip the way the trip page reads it: `trip`, `days`, `unscheduledEvents`, `docs`, `collaborators` (without the caller), `packingItems`, `packingLists`, `reservations`, `expenses`, `notes` and `accessRole`. A viewer gets no expenses. Nonmembers and unknown trips receive 404.

The response carries a strong `ETag` (a quoted SHA-256 of the serialized payload) and `Cache-Control: private, no-cache`. The tag is stable while the trip, the caller's role and the collaborators are unchanged, and differs after any write that changes the payload. Send it back as `If-None-Match` (a list, a `W/` prefix and `*` are accepted); a match returns `304` with the same headers and no body. The tag is per caller, because the payload depends on the caller's role.

### DELETE /api/v1/trips/:tripId

**Role** manager · **`Idempotency-Key`** yes · **Success** `204`

Deletes a trip and its associated records. Requires manager access; an editor receives 403 and a nonmember receives 404. A missing trip returns 204, including retries. Send an empty JSON object; unknown fields are rejected. Supports `Idempotency-Key`. Document files are queued for cleanup in the deletion transaction. The trip id is recorded as deleted, so a late `POST /api/v1/trips` retry with it returns 409 `conflict`. Success returns 204 with no body.

### PATCH /api/v1/trips/:tripId

**Role** editor · **`Idempotency-Key`** yes · **Success** `200` `Trip`

Editors may update trip metadata and dates with a strict partial JSON body: `name`, `startDate`, `endDate`, `destinationName`, `destinationCountry`, `destinationCountryCode`, `notes`, `budgetCurrency`, `budgetTotal`, `tags`, and `transitMode`, plus the date-change fields `resolution`, `confirmation` and the currency flag `convertCurrency`. Destination fields, transit mode, `startDate` and `endDate` accept null. Omitted fields remain unchanged; `coverImageUrl` and other cover fields are rejected (covers use `/trips/:tripId/cover`). Currency codes are normalized to uppercase and must be supported. Set `convertCurrency` to true with `budgetCurrency` to recalculate expense conversions in the same transaction. Without conversion, expense amounts stay unchanged. Returns the updated trip. Supports `Idempotency-Key`; access is rechecked on replay. Field limits match the web trip form (name required, text lengths, budget and tag limits); violations, unknown fields, unsupported currencies, invalid transit modes, ranges over 45 days and an `endDate` before the `startDate` (after applying the stored value for an omitted one) return 422 `validation_failed` without writing. A viewer gets `403`, a stranger `404`. `convertCurrency` without `budgetCurrency` (and no other field) is a no-op. Conversion also resets expenses already in the new currency to their native amount at rate 1; if a rate lookup fails, the request fails and neither the currency nor any expense changes.

**Dates.** `startDate` and `endDate` are `YYYY-MM-DD` or `null`. Sending only one keeps the other, and a start without an end is a one-day trip. Extending the range adds days, shrinking it removes the days that fall outside, `null` for `startDate` clears the dates and keeps the day rows, and giving a dateless trip dates maps its days onto them (days beyond the new range are removed). Remaining days are renumbered. Metadata and dates in one request commit together, including currency conversion.

**Removed content.** When removed days hold events, notes, checklists or reservations that overlap them, a request without `resolution` writes nothing and returns 409 `confirmation_required`. The error body carries a `confirmation` object (`removedDates`, optional `removedDayLabels`, `events`, optional `reservations`, `noteCount`, `checklistCount`, `eventDocumentCount`, and `reservationDocumentCount` when the overlapping reservations hold files). It is never cached for `Idempotency-Key` replay. To apply, send the same request again with `resolution` and that `confirmation` echoed back unchanged. `delete-events` deletes the events, the overlapping reservations and their documents, and the removed days; `keep-as-unscheduled` moves the events to the unscheduled list with the date they came from and deletes the removed days. Stored files are queued in the same transaction and removed after commit. The ids of deleted documents, and of the notes, checklists and checklist items on removed days, are recorded as deleted, so a late create retry with one returns 409 `conflict`. A `resolution` without a `confirmation` is 422 `validation_failed`. If the trip changed since the preview, so that the confirmation no longer matches, the response is 409 `conflict` and nothing is written; preview again.
