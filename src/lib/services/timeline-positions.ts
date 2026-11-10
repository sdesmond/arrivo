import "server-only";
import { and, eq, gte, max, sql } from "drizzle-orm";
import { events, itineraryChecklists, itineraryNotes } from "@/db/schema";
import type { DayItemRef } from "@/data/types";
import type { DbTransaction } from "@/lib/server-action-locks";
import { ConflictError } from "./conflict-error";

/** Events, itinerary notes and checklists share one position sequence per day. Callers hold the trip lock. */
type PositionExecutor = Pick<DbTransaction, "select" | "update">;

const timelineTables = [events, itineraryNotes, itineraryChecklists] as const;
const tableByType = { event: events, note: itineraryNotes, checklist: itineraryChecklists } as const;

function itemKey(item: DayItemRef): string {
  return `${item.type}:${item.id}`;
}

/** The position after the last item of the day: 0 on an empty day. */
export async function appendPosition(executor: PositionExecutor, dayId: string): Promise<number> {
  const [{ maxEvt }] = await executor
    .select({ maxEvt: max(events.position) })
    .from(events)
    .where(eq(events.dayId, dayId));
  const [{ maxNote }] = await executor
    .select({ maxNote: max(itineraryNotes.position) })
    .from(itineraryNotes)
    .where(eq(itineraryNotes.dayId, dayId));
  const [{ maxCl }] = await executor
    .select({ maxCl: max(itineraryChecklists.position) })
    .from(itineraryChecklists)
    .where(eq(itineraryChecklists.dayId, dayId));
  return Math.max(maxEvt ?? -1, maxNote ?? -1, maxCl ?? -1) + 1;
}

/** Opens a slot: every item of the day at or above `fromPosition` moves down by one. */
export async function shiftFromPosition(
  executor: PositionExecutor,
  dayId: string,
  fromPosition: number
): Promise<void> {
  for (const table of timelineTables) {
    await executor
      .update(table)
      .set({ position: sql`${table.position} + 1` })
      .where(and(eq(table.dayId, dayId), gte(table.position, fromPosition)));
  }
}

/**
 * Applies a complete ordered list to a day. The list must name exactly the day's current events, notes and checklists,
 * so a stale or foreign list is a `ConflictError` with nothing written. Returns whether anything was written: a list
 * already in stored order is a quiet success.
 */
export async function applyDayOrder(executor: PositionExecutor, dayId: string, items: DayItemRef[]): Promise<boolean> {
  const [currentEvents, currentNotes, currentChecklists] = await Promise.all(
    timelineTables.map((table) =>
      executor.select({ id: table.id, position: table.position }).from(table).where(eq(table.dayId, dayId))
    )
  );
  const stored = new Map<string, number>([
    ...currentEvents.map((row) => [itemKey({ type: "event", id: row.id }), row.position] as const),
    ...currentNotes.map((row) => [itemKey({ type: "note", id: row.id }), row.position] as const),
    ...currentChecklists.map((row) => [itemKey({ type: "checklist", id: row.id }), row.position] as const),
  ]);
  const submitted = new Set(items.map(itemKey));
  if (stored.size !== submitted.size || [...stored.keys()].some((key) => !submitted.has(key))) {
    throw new ConflictError("This day changed since it was loaded.");
  }

  let changed = false;
  for (const [index, item] of items.entries()) {
    if (stored.get(itemKey(item)) === index) continue;
    const table = tableByType[item.type];
    await executor
      .update(table)
      .set({ position: index })
      .where(and(eq(table.id, item.id), eq(table.dayId, dayId)));
    changed = true;
  }
  return changed;
}
