export type { TripEvent, TravelTo } from "./types";

import type { TripEvent } from "./types";
import { TOKYO_DAYS } from "./tokyo";

// Re-export typed aliases for consumers that still reference TimedEvent / FlexibleEvent.
export type TimedEvent = TripEvent;
export type FlexibleEvent = TripEvent;

const day5 = TOKYO_DAYS.find((d) => d.n === 5)!;

export const TIMED: TripEvent[]    = day5.events.filter((e) => !e.bucket);
export const FLEXIBLE: TripEvent[] = day5.events.filter((e) => !!e.bucket);
