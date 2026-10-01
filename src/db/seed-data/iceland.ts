import type { SeedTrip } from "./seed-types";

// Alex's other "someday" trip — the near-empty new-trip state: a name and one placeholder day, nothing
// else.
export const ICELAND_TRIP: SeedTrip = {
  key: "iceland",
  ownerKey: "alex",
  name: "Iceland Ring Road (someday)",
  startOffsetDays: null,
  endOffsetDays: null,
  days: [{ dayNumber: 1, label: "Day 1" }],
};
