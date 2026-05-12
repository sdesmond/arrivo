export type { SeedTripEvent as TripEvent } from "./seed-types";

import type { SeedTripEvent as TripEvent } from "./seed-types";
import { TOKYO_DAYS } from "./tokyo";

const day5 = TOKYO_DAYS.find((d) => d.dayNumber === 5)!;

export const TIMED: TripEvent[]       = day5.events.filter((e) => !!e.time);
export const UNSCHEDULED: TripEvent[] = day5.events.filter((e) => !e.time);
