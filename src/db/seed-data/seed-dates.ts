// Date helpers for the dev seed (`src/db/seed.ts`). Mirrors the pattern in
// tests/e2e/e2e-seed-data.ts:190 (`e2eTripDate` / `e2eTripDateTime`) but is intentionally NOT shared with
// it — `src/**` must not import from `tests/**`. Keep the two in sync by eye if the pattern changes.
//
// All trip dates in the seed are computed as offsets from `now` so trip status (derived at render time by
// getTripStatus in src/lib/utils.ts, never stored) stays correct no matter when the seed is run.

function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "YYYY-MM-DD" for `offsetDays` days from `now` (may be negative). */
export function seedDate(offsetDays: number, now: Date = new Date()): string {
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);
  return toDateKey(anchor);
}

/** A `Date` at `time` ("HH:mm") on the day `offsetDays` from `now`. */
export function seedDateTime(offsetDays: number, time: string, now: Date = new Date()): Date {
  return new Date(`${seedDate(offsetDays, now)}T${time}:00.000Z`);
}
