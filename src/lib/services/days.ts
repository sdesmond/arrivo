import "server-only";
import { db } from "@/db";
import { days, documents, events, itineraryChecklists, itineraryNotes, trips } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import type { Actor, DayItemOrder, DayRecord, IdempotentRequest } from "@/data/types";
import { dbDayToType } from "@/lib/db-mappers";
import type { DbTransaction } from "@/lib/server-action-locks";
import {
  addDay as addContract,
  deleteDay as deleteContract,
  reorderDay as reorderContract,
  updateDay as updateContract,
} from "@/lib/api/contract/days";
import { queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";
import { getNow } from "@/lib/mock-date";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { ConfirmationRequiredError } from "./confirmation-required-error";
import { ValidationFailedError } from "./validation-failed-error";
import { applyDayOrder } from "./timeline-positions";
import type { z } from "zod";

type Executor = Pick<DbTransaction, "select">;
type DayPatch = z.infer<typeof updateContract.body>;
type DayChanges = Partial<Pick<typeof days.$inferInsert, "label" | "subtitle" | "weather" | "travelSummary">>;

const MAX_TRIP_DAYS = 45;

async function readDay(executor: Executor, dayId: string) {
  const [row] = await executor.select().from(days).where(eq(days.id, dayId));
  return row;
}

async function readDayTripId(executor: Executor, dayId: string): Promise<string | undefined> {
  return (await readDay(executor, dayId))?.tripId;
}

function nextCalendarDate(date: string): string {
  const nextDate = new Date(`${date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

/** Explicit allow-list: a patch can never reach `id`, `tripId`, `dayNumber` or `date`. */
function columnChanges(patch: DayPatch): DayChanges {
  const changes: DayChanges = {};
  if (patch.label !== undefined) changes.label = patch.label;
  if (patch.subtitle !== undefined) changes.subtitle = patch.subtitle;
  if (patch.weather !== undefined) changes.weather = patch.weather;
  if (patch.travelSummary !== undefined) changes.travelSummary = patch.travelSummary;
  return changes;
}

/**
 * Replaces a day's complete timeline order. A list that no longer matches the day's events, notes and checklists is a
 * `ConflictError`; a list already in stored order writes nothing and runs no effect. A day that was deleted while the
 * client edited is not found, not a conflict.
 */
export async function reorderDay(
  actor: Actor,
  dayId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<DayItemOrder> {
  dayId = reorderContract.params.parse({ dayId }).dayId;
  const body = reorderContract.body.parse(input);
  const tripId = await readDayTripId(db, dayId);
  if (!tripId) throw new TripNotFoundError();
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<DayItemOrder>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      if ((await readDayTripId(transaction, dayId)) !== tripId) throw new TripNotFoundError();
    },
    mutate: async () => {
      if (await applyDayOrder(transaction, dayId, body.items)) markChanged();
      return { dayId, items: body.items };
    },
  }));
}

/**
 * Applies only the supplied fields: absent leaves a column alone and `null` clears it (the label cannot be cleared). An
 * empty patch returns the stored day and writes nothing. A day already gone cannot be authorized and is not found, and
 * so is one removed while the caller waited for the trip lock.
 */
export async function updateDay(
  actor: Actor,
  dayId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<DayRecord> {
  dayId = updateContract.params.parse({ dayId }).dayId;
  const patch = updateContract.body.parse(input);
  const found = await readDay(db, dayId);
  if (!found) throw new TripNotFoundError();
  const tripId = found.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<DayRecord>(actor, tripId, { replay, payload: patch }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      const current = await readDay(transaction, dayId);
      if (!current || current.tripId !== tripId) throw new TripNotFoundError();
      await requireTripRole(tripId, actor.userId, "editor", transaction);
    },
    mutate: async () => {
      const current = await readDay(transaction, dayId);
      if (!current) throw new TripNotFoundError();
      const changes = columnChanges(patch);
      if (Object.keys(changes).length === 0) return dbDayToType(current);
      const [updated] = await transaction.update(days).set(changes).where(eq(days.id, dayId)).returning();
      if (!updated) throw new TripNotFoundError();
      markChanged();
      return dbDayToType(updated);
    },
  }));
}

/**
 * Appends a day after the last one. A dated trip gets the next calendar date and its end date follows; a dateless trip
 * gets no date. A client `id` makes the create retry-safe: the same id in the same trip returns the stored day with no
 * write or effect, an id held by a trip the actor cannot see is not found, and one held by a visible trip is a 409.
 * A trip at 45 days is a `ValidationFailedError`.
 */
export async function addDay(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<DayRecord> {
  tripId = addContract.params.parse({ tripId }).tripId;
  const draft = addContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<DayRecord>(
    actor,
    tripId,
    { replay, payload: draft, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        // Claim the client UUID before the trip lock, in the namespace every day create shares.
        await lockClientIds(transaction, [draft.id && `day:${draft.id}`]);
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
        if (draft.id) {
          const existing = await readDay(transaction, draft.id);
          if (existing && existing.tripId !== tripId)
            await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
        }
      },
      mutate: async () => {
        if (draft.id) {
          const existing = await readDay(transaction, draft.id);
          if (existing) {
            if (existing.tripId !== tripId) throw new ConflictError("This ID was already used for a different day.");
            return dbDayToType(existing);
          }
        }
        const [trip] = await transaction.select({ startDate: trips.startDate }).from(trips).where(eq(trips.id, tripId));
        if (!trip) throw new TripNotFoundError();
        const allDays = await transaction
          .select()
          .from(days)
          .where(eq(days.tripId, tripId))
          .orderBy(asc(days.dayNumber));
        const lastDay = allDays.at(-1);
        if (!lastDay) throw new ConflictError("Unable to add a day because this trip has no days.");
        if (allDays.length >= MAX_TRIP_DAYS) {
          throw new ValidationFailedError("Max trip length is 45 days. Please shorten your date range.");
        }
        if (allDays.some((day, index) => day.dayNumber !== index + 1)) {
          throw new ConflictError("Unable to add a day because the itinerary day order is inconsistent.");
        }
        const dayNumber = lastDay.dayNumber + 1;
        const date = trip.startDate && lastDay.date ? nextCalendarDate(lastDay.date) : null;
        const [created] = await transaction
          .insert(days)
          .values({ ...(draft.id ? { id: draft.id } : {}), tripId, dayNumber, date, label: `Day ${dayNumber}` })
          .returning();
        if (date) {
          await transaction.update(trips).set({ endDate: date, updatedAt: getNow() }).where(eq(trips.id, tripId));
        }
        markChanged();
        return dbDayToType(created);
      },
    })
  );
}

/**
 * Removes the trip's last day, which is the only one that can go, and never the only day left (`ConflictError`). A day
 * with events, notes or checklists needs `confirmDestructive`, else `ConfirmationRequiredError`. The trip end date moves
 * to the preceding day's date when it has one. Event-document file names are queued in the transaction and the files go
 * after the commit, never on a replay or rollback. A day that is already gone succeeds once the caller is authorized
 * for the supplied trip.
 */
export async function deleteDay(
  actor: Actor,
  dayId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<null> {
  dayId = deleteContract.params.parse({ dayId }).dayId;
  const body = deleteContract.body.parse(input);
  const { tripId } = body;
  await requireTripRole(tripId, actor.userId, "editor");
  let queued: QueuedFileDeletion[] = [];
  await runTripWrite<null>(
    actor,
    tripId,
    { replay, payload: body, revalidate: ["/trips"] },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
        const current = await readDay(transaction, dayId);
        if (current && current.tripId !== tripId) throw new TripNotFoundError();
      },
      mutate: async () => {
        queued = [];
        if (!(await readDay(transaction, dayId))) return null;
        const tripDays = await transaction
          .select()
          .from(days)
          .where(eq(days.tripId, tripId))
          .orderBy(asc(days.dayNumber));
        if (tripDays.at(-1)?.id !== dayId) throw new ConflictError("Only the last day can be removed.");
        if (tripDays.length === 1) throw new ConflictError("Cannot remove the only remaining day.");
        const dayEvents = await transaction.select({ id: events.id }).from(events).where(eq(events.dayId, dayId));
        const dayNotes = await transaction
          .select({ id: itineraryNotes.id })
          .from(itineraryNotes)
          .where(eq(itineraryNotes.dayId, dayId));
        const dayChecklists = await transaction
          .select({ id: itineraryChecklists.id })
          .from(itineraryChecklists)
          .where(eq(itineraryChecklists.dayId, dayId));
        const hasContent = dayEvents.length > 0 || dayNotes.length > 0 || dayChecklists.length > 0;
        if (hasContent && !body.confirmDestructive) {
          throw new ConfirmationRequiredError("This day has planned content. Confirm to remove it.");
        }
        if (dayEvents.length > 0) {
          const eventDocuments = await transaction
            .select({ url: documents.url })
            .from(documents)
            .where(
              inArray(
                documents.eventId,
                dayEvents.map((event) => event.id)
              )
            );
          queued = await queueFileDeletions(
            transaction,
            eventDocuments.map((document) => document.url).filter((url): url is string => !!url)
          );
        }
        await transaction.delete(days).where(eq(days.id, dayId));
        const precedingDate = tripDays.at(-2)?.date;
        if (precedingDate) {
          await transaction
            .update(trips)
            .set({ endDate: precedingDate, updatedAt: getNow() })
            .where(eq(trips.id, tripId));
        }
        markChanged();
        return null;
      },
    })
  );
  // Best effort: the rows are gone and the names are queued, so a failure only leaves the file for the next drain.
  await removeQueuedFiles(queued);
  return null;
}
