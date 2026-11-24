import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, expenses, reservations } from "@/db/schema";
import type { Actor, Expense, ExpenseWithConversionFlag, IdempotentRequest } from "@/data/types";
import { createExpense as createContract, listExpenses as listContract } from "@/lib/api/contract/expenses";
import { dbExpenseToType } from "@/lib/db-mappers";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { refuseRecentlyDeleted } from "./deletion-records";
import { computeConversions } from "./expense-conversions";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { ValidationFailedError } from "./validation-failed-error";

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
