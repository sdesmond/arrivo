export type { SeedTripEvent as TripEvent } from "./seed-types";

import type { SeedTripEvent as TripEvent } from "./seed-types";
import { TOKYO_DAYS } from "./tokyo";

const day5 = TOKYO_DAYS.find((day) => day.dayNumber === 5)!;

export const TIMED: TripEvent[] = day5.events.filter((event) => !!event.time);
export const UNSCHEDULED: TripEvent[] = day5.events.filter((event) => !event.time);
