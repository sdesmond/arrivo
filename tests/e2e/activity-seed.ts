import { randomInt, randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { activityEvents } from "../../src/db/schema";
import { withE2EDb } from "./e2e-db";

const DAY_MS = 86_400_000;

export interface SeedActor {
  id: string;
  username: string;
}

export interface SeedActivityEvent {
  type: string;
  actor: SeedActor | null;
  startedAt: Date;
  endedAt?: Date;
  target?: { id: string | null; username: string };
  tripId?: string;
}

// Rows are scenario-owned: every seeded row is deleted after the scenario, and scenarios scope their assertions with
// the actor filter or a one-minute date range so rows from parallel scenarios never mix in.
const seededIds: string[] = [];

export function seedActor(username: string): SeedActor {
  return { id: randomUUID(), username };
}

/** A random past minute 1–20 days ago, safely inside every retention policy, including day-hour range fixtures. */
export function uniqueSeedMinute(): Date {
  const now = new Date();
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - randomInt(2, 20) * DAY_MS;
  return new Date(day + randomInt(0, 1440) * 60_000);
}

export async function seedActivityEvents(events: SeedActivityEvent[]): Promise<string[]> {
  if (events.length === 0) return [];
  const ids = events.map(() => randomUUID());
  seededIds.push(...ids);
  await withE2EDb((database) =>
    database.insert(activityEvents).values(
      events.map((event, index) => ({
        id: ids[index],
        type: event.type,
        startedAt: event.startedAt,
        endedAt: event.endedAt ?? event.startedAt,
        actorId: event.actor?.id ?? null,
        actorUsername: event.actor?.username ?? null,
        targetId: event.target?.id ?? null,
        targetUsername: event.target?.username ?? null,
        tripId: event.tripId ?? null,
      }))
    )
  );
  return ids;
}

export async function removeSeededActivity(): Promise<void> {
  const ids = seededIds.splice(0);
  if (ids.length === 0) return;
  await withE2EDb((database) => database.delete(activityEvents).where(inArray(activityEvents.id, ids)));
}
