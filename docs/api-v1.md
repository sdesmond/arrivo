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

Every response carries `Cache-Control: no-store`. Success is `200` with the JSON body named under each endpoint, or `204` with no body. Optional fields are omitted when empty rather than sent as `null`.

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

Every trip-scoped write needs the **editor** role or above (`viewer` < `editor` < `manager`). A caller who is not a member gets 404; a viewer gets 403 with `"requiredRole": "editor"`. Access is checked again inside the write's transaction, after the trip lock, so a role removed mid-request still refuses.

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

Endpoints marked **`Idempotency-Key`: yes** replay a retried request instead of running it twice.

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
{ "apiVersion": 1, "capabilities": ["idempotency-key"] }
```

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
