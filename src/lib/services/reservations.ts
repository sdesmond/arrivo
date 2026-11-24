import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenses, reservations, trips } from "@/db/schema";
import type { Actor, IdempotentRequest, Reservation } from "@/data/types";
import { createReservation as createContract, listReservations as listContract } from "@/lib/api/contract/reservations";
import { dbDocToType, dbExpenseToType, dbReservationToType } from "@/lib/db-mappers";
import { extendTripDateRange } from "@/lib/reservation-date-range";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { refuseRecentlyDeleted } from "./deletion-records";
import { requireTripRole, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite } from "./trip-write";
import { ValidationFailedError } from "./validation-failed-error";

export async function listReservations(
  actor: Actor,
  tripId: string,
  input: unknown = {}
): Promise<{ reservations: Reservation[] }> {
  tripId = listContract.params.parse({ tripId }).tripId;
  listContract.body.parse(input);
  const role = await requireTripRole(tripId, actor.userId, "viewer");
  const rows = await db.select().from(reservations).where(eq(reservations.tripId, tripId)).orderBy(reservations.id);
  const ids = rows.map((row) => row.id);
  const docs = ids.length
    ? await db
        .select()
        .from(documents)
        .where(inArray(documents.reservationId, ids))
        .orderBy(sql`${documents.addedAt} desc nulls last`, asc(documents.id))
    : [];
  const costs =
    role === "viewer" ? [] : await db.select().from(expenses).where(eq(expenses.tripId, tripId)).orderBy(expenses.id);
  return {
    reservations: rows.map((row) => {
      const cost = costs.filter((entry) => entry.reservationId === row.id).at(-1);
      return {
        ...dbReservationToType(row),
        ...(cost ? { expense: dbExpenseToType(cost) } : {}),
        documents: docs.filter((entry) => entry.reservationId === row.id).map(dbDocToType),
      };
    }),
  };
}

export async function createReservation(
  actor: Actor,
  tripId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<Reservation> {
  tripId = createContract.params.parse({ tripId }).tripId;
  const body = createContract.body.parse(input);
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<Reservation>(actor, tripId, { replay, payload: body }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockClientIds(transaction, [`reservation:${body.id}`]);
      await lockTrip(transaction, tripId);
      await requireTripRole(tripId, actor.userId, "editor", transaction);
      const [existing] = await transaction.select().from(reservations).where(eq(reservations.id, body.id));
      if (existing && existing.tripId !== tripId)
        await requireTripRole(existing.tripId, actor.userId, "viewer", transaction);
    },
    validateReplay: async (result) => {
      const [row] = await transaction.select().from(reservations).where(eq(reservations.id, body.id));
      if (!row) {
        await refuseRecentlyDeleted(transaction, "reservation", body.id);
        throw new TripNotFoundError();
      }
      if (row.tripId !== tripId || row.createdAt?.toISOString() !== result.createdAt) throw new TripNotFoundError();
    },
    mutate: async () => {
      const [existing] = await transaction.select().from(reservations).where(eq(reservations.id, body.id));
      if (existing) {
        const mapped = dbReservationToType(existing);
        const fields = [
          "type",
          "provider",
          "startAt",
          "endAt",
          "startAddress",
          "startLocationName",
          "startLocationLat",
          "startLocationLng",
          "endAddress",
          "endLocationName",
          "endLocationLat",
          "endLocationLng",
          "confirmationCode",
          "serviceNumber",
          "notes",
        ] as const;
        if (
          existing.tripId !== tripId ||
          fields.some((field) => {
            const value = body[field];
            const normalized =
              field === "provider"
                ? body.provider.trim()
                : (field === "startAt" || field === "endAt") && typeof value === "string"
                  ? new Date(value).toISOString()
                  : (value ?? undefined);
            return (mapped[field] ?? undefined) !== normalized;
          })
        )
          throw new ConflictError("This ID was already used for a different reservation.");
        return mapped;
      }
      await refuseRecentlyDeleted(transaction, "reservation", body.id);
      const [trip] = await transaction
        .select({ startDate: trips.startDate, endDate: trips.endDate })
        .from(trips)
        .where(eq(trips.id, tripId));
      if (!trip) throw new TripNotFoundError();
      if (!trip.startDate) throw new ValidationFailedError("Set trip dates before adding a reservation.");
      try {
        await extendTripDateRange(
          transaction,
          tripId,
          trip.startDate,
          trip.endDate ?? undefined,
          body.startAt ? new Date(body.startAt).toISOString() : undefined,
          body.endAt ? new Date(body.endAt).toISOString() : undefined
        );
      } catch (error) {
        if (error instanceof Error && error.message === "Trip cannot exceed 45 days.")
          throw new ValidationFailedError(error.message);
        throw error;
      }
      const [row] = await transaction
        .insert(reservations)
        .values({
          ...body,
          tripId,
          provider: body.provider.trim(),
          startAt: body.startAt ? new Date(body.startAt) : undefined,
          endAt: body.endAt ? new Date(body.endAt) : undefined,
        })
        .returning();
      markChanged();
      return dbReservationToType(row);
    },
  }));
}
