import "server-only";
import { after } from "next/server";
import { db } from "@/db";
import { activityEvents } from "@/db/schema";
import type { ActivityEventInput } from "@/data/types";
import { BATCHED_TYPES, mergeActivityInterval } from "./activity-batches";

export const ACTIVITY_WRITE_TIMEOUT_MS = 5_000;

// Real server time, deliberately not getNow(): simulated itinerary dates must never decide when Activity happened.
const realClock = () => new Date();
let clock: () => Date = realClock;

/** Test seam: inject the occurrence clock; call with no argument to restore the real one. */
export function setActivityClock(next?: () => Date): void {
  clock = next ?? realClock;
}

// Log the error's class only: driver messages can echo row values or connection strings.
function logFailure(stage: "schedule" | "write", error: unknown): void {
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(`[activity] ${stage} failed (${name})`);
}

async function persist(input: ActivityEventInput, occurredAt: Date): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Activity write timed out")), ACTIVITY_WRITE_TIMEOUT_MS);
    });
    const insert = Promise.resolve(
      BATCHED_TYPES.has(input.type) && input.actor
        ? mergeActivityInterval(db, { ...input, actor: input.actor }, occurredAt)
        : db.insert(activityEvents).values({
            type: input.type,
            startedAt: occurredAt,
            endedAt: occurredAt,
            actorId: input.actor?.id ?? null,
            actorUsername: input.actor?.username ?? null,
            targetId: input.target?.id ?? null,
            targetUsername: input.target?.username ?? null,
            tripId: input.tripId ?? null,
          })
    );
    // A rejection after the timeout won, if any, must not become an unhandled rejection.
    insert.catch(() => undefined);
    await Promise.race([insert, timeout]);
  } catch (error) {
    logFailure("write", error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort: schedules the write for after the response, never throws, never retries. Call only once the
 * primary outcome has committed, and never inside its transaction.
 */
export function recordActivity(input: ActivityEventInput): void {
  try {
    const occurredAt = clock();
    after(() => persist(input, occurredAt));
  } catch (error) {
    logFailure("schedule", error);
  }
}
