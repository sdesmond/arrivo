# Dev seed data

`npm run db:seed` (`src/db/seed.ts`) populates `DATABASE_URL` with a small, realistic multi-account world:
five accounts, six trips spanning every date state (active, upcoming, past, and two with no dates yet),
cross-account sharing in both directions, and all three states the share dialog can render. It's meant to be a
starting point that already exercises most app surfaces without any manual setup.

> Keep this doc in sync with `src/db/seed-data/**` — if you change a seeded user, trip, share, or invitation,
> update the tables below in the same change.

## Re-run behavior

`db:seed` **wipes and reseeds the five seed accounts on every run** — safe to run any time, including
repeatedly. It deletes `users` rows by the five seed usernames (cascading to everything those accounts own:
trips, days, events, documents, reservations, expenses, packing, notes, collaborator rows, and invitations
they sent or received), then reinserts the whole world fresh. It never touches any other account, so hand-created data in
your dev database is left alone.

Trip dates are computed as offsets from the moment the seed runs (`src/db/seed-data/seed-dates.ts`), so trip
status — active / upcoming / past, derived at render time by `getTripStatus()`, never stored — stays correct
no matter when you seed.

## Accounts

All five share the password `demo1234`.

| Account  | Name        | Profile                                                                                                                        | Why                                                                                                        |
| -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `demo`   | Demo User   | USD, `MM/DD/YYYY`, passport + known traveler number, 2 loyalty numbers, 2 wishlist destinations, 1 companion, thresholds 80/90 | The primary account — README/SETUP have always pointed here                                                |
| `alex`   | Alex Rivera | EUR, `DD/MM/YYYY`, `defaultCoverType: "map"`, 1 loyalty number, thresholds 70/85                                               | Exercises the non-default currency, date format, cover type, and threshold paths                           |
| `sam`    | Sam Chen    | USD, owns no trips                                                                                                             | Receives a pending invitation — exercises the invitee-side pending-invitations flow on `/trips` end to end |
| `jordan` | Jordan Lee  | USD, owns no trips                                                                                                             | Has already declined an invitation — the share dialog's Declined row                                       |
| `admin`  | Admin User  | USD, `MM/DD/YYYY`, instance role `admin`, owns no trips                                                                        | The instance administrator — exercises admin-only surfaces; every other seed account is a `member`         |

## Trips

| Trip                            | Owner | Dates                      | `/trips` grouping | Contents                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ----- | -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tokyo**                       | Demo  | −2 → +5 days from seed run | Active            | 8 days; timed + untimed events with locations and confirmation numbers; 1 unscheduled event; trip-, event-, and reservation-scoped documents; flight + lodging reservations; expenses ≈85% of a 4500 USD budget (**warning** band); 2 packing lists with labels and partial progress; 2 trip notes; an itinerary note + checklist on the day spanning "today" |
| **Kyoto**                       | Demo  | −180 → −173 days           | Past              | 8 days, events, a document; expenses ≈105% of budget (**danger** band); packing list fully checked — feeds travel-history and spending                                                                                                                                                                                                                        |
| **Patagonia (someday)**         | Demo  | none                       | Unscheduled       | 1 placeholder day, 2 unscheduled events, one packing list just getting started, no budget — the "no dates yet" case                                                                                                                                                                                                                                           |
| **Lisbon**                      | Alex  | +21 → +25 days             | Upcoming          | 5 days, events, documents, a lodging reservation with a linked document, expenses ≈40% of a 1800 EUR budget (**neutral** band), a packing list, 1 trip note                                                                                                                                                                                                   |
| **Marrakech**                   | Alex  | −365 → −359 days           | Past              | Deliberately sparse: dates, budget, and expenses only — no days, events, documents, or packing. Exercises an empty itinerary and a past trip with nothing else attached                                                                                                                                                                                       |
| **Iceland Ring Road (someday)** | Alex  | none                       | Unscheduled       | A name and one placeholder day only — the near-empty new-trip state                                                                                                                                                                                                                                                                                           |

A dateless trip's derived `status` is still `"upcoming"` (`getTripStatus` treats missing dates as upcoming) —
it's the `/trips` page's separate Unscheduled tab/group (`use-trips-page-handlers.ts`) that filters it out
of the active/upcoming/past split by checking for a missing `startDate`, not a distinct status value.

Trip covers come from `deriveGraphicCover(name)` (`src/lib/utils.ts`), the same helper the app uses when a
new trip has no cover image yet.

## Sharing graph

| Trip      | Shared with | Role   | Why                                                                                                                                                                     |
| --------- | ----------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokyo     | Alex        | Editor | An editor working on someone else's trip                                                                                                                                |
| Patagonia | Alex        | Viewer | Viewer-role gating: budget is hidden in trip detail, and the trip is excluded from Alex's personal expense report (`listExpensesForUserInRange` drops viewer-role rows) |
| Lisbon    | Demo        | Editor | Demo's own trip list contains a trip they don't own                                                                                                                     |

## Invitations (both on Tokyo)

| Invitee  | Role   | Status   | Expires                 |
| -------- | ------ | -------- | ----------------------- |
| `sam`    | Editor | Pending  | 72h after the seed run  |
| `jordan` | Viewer | Declined | 24h before the seed run |

Opening Tokyo's share dialog as Demo renders all three non-creator row states at once: an active collaborator
(Alex · Editor), a Pending row (Sam), and a Declined row (Jordan) — alongside Demo's own creator row.

## Where the data lives

- `src/db/seed-data/seed-types.ts` — the seed-local shapes (deliberately decoupled from `src/data/types.ts`'s
  render-time types; only the enum unions are shared)
- `src/db/seed-data/seed-dates.ts` — offset-from-now date helpers
- `src/db/seed-data/users.ts`, `tokyo.ts`, `kyoto.ts`, `patagonia.ts`, `lisbon.ts`, `marrakech.ts`,
  `iceland.ts` — the actual seed content, one file per trip
- `src/db/seed-data/index.ts` — `DEV_SEED`, the assembled world (trips + the sharing graph + invitations)
- `src/db/seed-inserts-accounts.ts` / `src/db/seed-inserts-trip.ts` — the Drizzle insert helpers
- `src/db/seed-runner.ts` — `validateSeedWorld()` (structural checks — unique keys, resolvable references,
  at least one dateless trip, no trip shared with its own owner) and `seedDevDatabase()` (delete + insert
  orchestration)
- `src/db/seed.ts` — the `npm run db:seed` CLI entry point

## Adding to the world

1. Add or edit a `SeedTrip` / `SeedUser` in `src/db/seed-data/`.
2. Wire any new sharing or invitation rows into `src/db/seed-data/index.ts`.
3. Update the tables in this doc.
4. Run `npm run db:seed` — `validateSeedWorld()` throws immediately with a specific message if a reference
   doesn't resolve (unknown user/trip key, a packing item nested under a nonexistent label, a duplicate
   pending invitation, and so on) before anything is written.
