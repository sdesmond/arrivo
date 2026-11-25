import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, expenses, reservations } from "@/db/schema";
import type { Actor, Expense, ExpenseWithConversionFlag, IdempotentRequest } from "@/data/types";
import {
  createExpense as createContract,
  deleteExpense as deleteContract,
  listExpenses as listContract,
  updateExpense as updateContract,
} from "@/lib/api/contract/expenses";
import { dbExpenseToType } from "@/lib/db-mappers";
import { getNow } from "@/lib/mock-date";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { recordDeletion, refuseRecentlyDeleted } from "./deletion-records";
import { computeConversions } from "./expense-conversions";
import { requireTripRole, TripForbiddenError, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite, type ReadExecutor } from "./trip-write";
import { ValidationFailedError } from "./validation-failed-error";
import type { z } from "zod";

/** Viewers see no expenses, matching the reservation list and the trip bundle. */
export async function listExpenses(
  actor: Actor,
  tripId: string,
  input: unknown = {}
): Promise<{ expenses: Expense[] }> {
  tripId = listContract.params.parse({ tripId }).tripId;
  listContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  const rows = await db
    .select()
    .from(expenses)
    .where(eq(expenses.tripId, tripId))
    .orderBy(expenses.date, expenses.createdAt, expenses.id);
  return { expenses: rows.map(dbExpenseToType) };
}

export async function createExpense(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<ExpenseWithConversionFlag> {
  tripId = createContract.params.parse({ tripId }).tripId;
  const body = createContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  const currency = body.currency.trim().toUpperCase();
  const note = body.note?.trim() || undefined;
  return runTripWrite<ExpenseWithConversionFlag>(
    actor,
    tripId,
    { replay, payload: body },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockClientIds(transaction, [`expense:${body.id}`]);
        await lockTrip(transaction, tripId);
        await requireTripRole(tripId, actor.userId, "editor", transaction);
        const [existing] = await transaction.select().from(expenses).where(eq(expenses.id, body.id));
        if (existing && existing.tripId !== tripId)
          await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
      },
      validateReplay: async (result) => {
        const [row] = await transaction.select().from(expenses).where(eq(expenses.id, body.id));
        if (!row) {
          await refuseRecentlyDeleted(transaction, "expense", body.id);
          throw new TripNotFoundError();
        }
        if (row.tripId !== tripId || row.createdAt?.toISOString() !== result.createdAt) throw new TripNotFoundError();
      },
      mutate: async () => {
        const [existing] = await transaction.select().from(expenses).where(eq(expenses.id, body.id));
        if (existing) {
          const mapped = dbExpenseToType(existing);
          if (
            existing.tripId !== tripId ||
            mapped.category !== body.category ||
            mapped.amount !== body.amount ||
            mapped.currency !== currency ||
            mapped.date !== body.date ||
            (mapped.note ?? undefined) !== note ||
            (mapped.eventId ?? undefined) !== (body.eventId ?? undefined) ||
            (mapped.reservationId ?? undefined) !== (body.reservationId ?? undefined)
          )
            throw new ConflictError("This ID was already used for a different expense.");
          return mapped;
        }
        await refuseRecentlyDeleted(transaction, "expense", body.id);
        if (body.eventId) {
          const [event] = await transaction
            .select({ id: events.id })
            .from(events)
            .where(and(eq(events.id, body.eventId), eq(events.tripId, tripId)));
          if (!event) throw new ValidationFailedError("Event not found.");
        }
        if (body.reservationId) {
          const [reservation] = await transaction
            .select({ id: reservations.id })
            .from(reservations)
            .where(and(eq(reservations.id, body.reservationId), eq(reservations.tripId, tripId)));
          if (!reservation) throw new ValidationFailedError("Reservation not found.");
        }
        const { fields, conversionError } = await computeConversions(
          tripId,
          actor.userId,
          body.amount,
          currency,
          body.date,
          transaction
        );
        const [row] = await transaction
          .insert(expenses)
          .values({
            id: body.id,
            tripId,
            eventId: body.eventId ?? null,
            reservationId: body.reservationId ?? null,
            category: body.category,
            amount: body.amount.toString(),
            currency,
            ...fields,
            date: body.date,
            note: note ?? null,
          })
          .returning();
        markChanged();
        return { ...dbExpenseToType(row), ...(conversionError ? { conversionError: true as const } : {}) };
      },
    })
  );
}

type ExpensePatch = z.infer<typeof updateContract.body>;
type ExpenseRow = typeof expenses.$inferSelect;
type ExpenseChanges = Partial<
  Pick<typeof expenses.$inferInsert, "category" | "amount" | "currency" | "date" | "note" | "eventId" | "reservationId">
>;

async function readExpense(executor: ReadExecutor, expenseId: string): Promise<ExpenseRow | undefined> {
  const [row] = await executor.select().from(expenses).where(eq(expenses.id, expenseId));
  return row;
}

/** Explicit allow-list: a patch can never reach `id`, `tripId`, the conversion columns or the timestamps. */
function columnChanges(patch: ExpensePatch): ExpenseChanges {
  const changes: ExpenseChanges = {};
  if (patch.category !== undefined) changes.category = patch.category;
  if (patch.amount !== undefined) changes.amount = patch.amount.toString();
  if (patch.currency !== undefined) changes.currency = patch.currency.trim().toUpperCase();
  if (patch.date !== undefined) changes.date = patch.date;
  if (patch.note !== undefined) changes.note = patch.note?.trim() || null;
  if (patch.eventId !== undefined) changes.eventId = patch.eventId;
  if (patch.reservationId !== undefined) changes.reservationId = patch.reservationId;
  return changes;
}

function sameValue(key: keyof ExpenseChanges, stored: ExpenseRow, next: ExpenseChanges): boolean {
  if (key === "amount") return Number(stored.amount) === Number(next.amount);
  return (stored[key] ?? null) === (next[key] ?? null);
}

/**
 * Applies only the supplied fields under the trip lock: absent leaves a column alone and `null` clears the note or a
 * link. The merged links must name at most one event or reservation of this trip. Conversions are recomputed only when
 * the amount, currency or date changes; a failed lookup saves unconverted and flags `conversionError`. A patch that
 * changes nothing returns the stored row and writes nothing.
 */
export async function updateExpense(
  actor: Actor,
  expenseId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<ExpenseWithConversionFlag> {
  expenseId = updateContract.params.parse({ expenseId }).expenseId;
  const patch = updateContract.body.parse(input);
  const found = await readExpense(db, expenseId);
  if (!found) throw new TripNotFoundError();
  const tripId = found.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<ExpenseWithConversionFlag>(
    actor,
    tripId,
    { replay, payload: patch },
    (transaction, markChanged) => ({
      authorize: async () => {
        await lockTrip(transaction, tripId);
        const current = await readExpense(transaction, expenseId);
        if (!current || current.tripId !== tripId) throw new TripNotFoundError();
        try {
          await requireTripRole(tripId, actor.userId, "editor", transaction);
        } catch (error) {
          if (error instanceof TripForbiddenError) throw new TripNotFoundError();
          throw error;
        }
      },
      mutate: async () => {
        const current = await readExpense(transaction, expenseId);
        if (!current) throw new TripNotFoundError();
        const changes = columnChanges(patch);
        const changedKeys = (Object.keys(changes) as (keyof ExpenseChanges)[]).filter(
          (key) => !sameValue(key, current, changes)
        );
        if (changedKeys.length === 0) return dbExpenseToType(current);

        const nextEventId = changes.eventId === undefined ? current.eventId : changes.eventId;
        const nextReservationId = changes.reservationId === undefined ? current.reservationId : changes.reservationId;
        if (nextEventId && nextReservationId)
          throw new ValidationFailedError("Expense cannot be linked to both an event and a reservation.");
        if (changes.eventId) {
          const [event] = await transaction
            .select({ id: events.id })
            .from(events)
            .where(and(eq(events.id, changes.eventId), eq(events.tripId, tripId)));
          if (!event) throw new ValidationFailedError("Event not found.");
        }
        if (changes.reservationId) {
          const [reservation] = await transaction
            .select({ id: reservations.id })
            .from(reservations)
            .where(and(eq(reservations.id, changes.reservationId), eq(reservations.tripId, tripId)));
          if (!reservation) throw new ValidationFailedError("Reservation not found.");
        }

        let conversions: Awaited<ReturnType<typeof computeConversions>> | undefined;
        if (changedKeys.some((key) => key === "amount" || key === "currency" || key === "date")) {
          conversions = await computeConversions(
            tripId,
            actor.userId,
            Number(changes.amount ?? current.amount),
            changes.currency ?? current.currency,
            changes.date ?? current.date,
            transaction
          );
        }
        const [updated] = await transaction
          .update(expenses)
          .set({
            ...Object.fromEntries(changedKeys.map((key) => [key, changes[key]])),
            ...conversions?.fields,
            updatedAt: getNow(),
          })
          .where(eq(expenses.id, expenseId))
          .returning();
        if (!updated) throw new TripNotFoundError();
        markChanged();
        return {
          ...dbExpenseToType(updated),
          ...(conversions?.conversionError ? { conversionError: true as const } : {}),
        };
      },
    })
  );
}

/** Deletes under the trip lock and records the id, so a late create retry cannot bring the expense back. */
export async function deleteExpense(actor: Actor, expenseId: string, input: unknown = {}): Promise<null> {
  expenseId = deleteContract.params.parse({ expenseId }).expenseId;
  deleteContract.body.parse(input);
  const found = await readExpense(db, expenseId);
  if (!found) return null;
  const tripId = found.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  let tripGone = false;
  await runTripWrite<null>(actor, tripId, { payload: {} }, (transaction, markChanged) => ({
    authorize: async () => {
      try {
        await lockTrip(transaction, tripId);
      } catch (error) {
        if (!(error instanceof TripNotFoundError)) throw error;
        tripGone = true;
        return;
      }
      try {
        await requireTripRole(tripId, actor.userId, "editor", transaction);
      } catch (error) {
        if (error instanceof TripForbiddenError) throw new TripNotFoundError();
        throw error;
      }
      const current = await readExpense(transaction, expenseId);
      if (current && current.tripId !== tripId) throw new TripNotFoundError();
    },
    mutate: async () => {
      if (tripGone) return null;
      if (!(await readExpense(transaction, expenseId))) return null;
      await transaction.delete(expenses).where(eq(expenses.id, expenseId));
      await recordDeletion(transaction, "expense", expenseId, actor.userId);
      markChanged();
      return null;
    },
  }));
  return null;
}
