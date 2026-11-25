import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, expenses, reservations, trips } from "@/db/schema";
import type { Actor, IdempotentRequest, Reservation, ReservationType } from "@/data/types";
import {
  createReservation as createContract,
  deleteReservation as deleteContract,
  getReservation as getContract,
  listReservations as listContract,
  updateReservation as updateContract,
} from "@/lib/api/contract/reservations";
import { dbDocToType, dbExpenseToType, dbReservationToType } from "@/lib/db-mappers";
import { getNow } from "@/lib/mock-date";
import { extendTripDateRange } from "@/lib/reservation-date-range";
import { REQUIRES_END_AT } from "@/lib/reservation-types";
import type { z } from "zod";
import { lockClientIds } from "./client-ids";
import { ConflictError } from "./conflict-error";
import { recordDeletion, recordDeletions, refuseRecentlyDeleted } from "./deletion-records";
import { requireTripRole, TripForbiddenError, TripNotFoundError } from "./trip-access";
import { lockTrip, runTripWrite, type ReadExecutor } from "./trip-write";
import { ValidationFailedError } from "./validation-failed-error";
import { resolveDocumentTripId } from "@/lib/document-ancestry";
import { queueFileDeletions, removeQueuedFiles, type QueuedFileDeletion } from "@/lib/file-cleanup";

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

type ReservationPatch = z.infer<typeof updateContract.body>;
type ReservationRow = typeof reservations.$inferSelect;
type ReservationChanges = Partial<Omit<typeof reservations.$inferInsert, "id" | "tripId" | "type" | "createdAt">>;

const TRIP_LIMIT_MESSAGE = "Trip cannot exceed 45 days.";

async function readReservation(executor: ReadExecutor, reservationId: string): Promise<ReservationRow | undefined> {
  const [row] = await executor.select().from(reservations).where(eq(reservations.id, reservationId));
  return row;
}

/** Deletes attached rows under the trip lock and removes queued files only after commit. */
export async function deleteReservation(actor: Actor, reservationId: string, input: unknown = {}): Promise<null> {
  reservationId = deleteContract.params.parse({ reservationId }).reservationId;
  deleteContract.body.parse(input);
  const found = await readReservation(db, reservationId);
  if (!found) return null;
  const tripId = found.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  let queued: QueuedFileDeletion[] = [];
  let deleted = false;
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
      const current = await readReservation(transaction, reservationId);
      if (current && current.tripId !== tripId) throw new TripNotFoundError();
    },
    mutate: async () => {
      if (tripGone) return null;
      const current = await readReservation(transaction, reservationId);
      if (!current) return null;
      const attached = await transaction.select().from(documents).where(eq(documents.reservationId, reservationId));
      for (const document of attached) {
        if ((await resolveDocumentTripId(transaction, document)) !== tripId) throw new TripNotFoundError();
      }
      const linkedExpenses = await transaction
        .select({ id: expenses.id })
        .from(expenses)
        .where(eq(expenses.reservationId, reservationId));
      queued = await queueFileDeletions(
        transaction,
        attached.map((document) => document.url).filter((url): url is string => !!url)
      );
      await recordDeletion(transaction, "reservation", reservationId, actor.userId);
      await recordDeletions(
        transaction,
        "expense",
        linkedExpenses.map((expense) => expense.id),
        actor.userId
      );
      await recordDeletions(
        transaction,
        "document",
        attached.map((document) => document.id),
        actor.userId
      );
      await transaction.delete(reservations).where(eq(reservations.id, reservationId));
      deleted = true;
      markChanged();
      return null;
    },
  }));
  if (deleted) {
    try {
      await removeQueuedFiles(queued);
    } catch (error) {
      console.warn("Could not remove deleted reservation files", error);
    }
  }
  return null;
}

/** One reservation with its documents, and its latest expense for editors and managers. */
export async function getReservation(actor: Actor, reservationId: string, input: unknown = {}): Promise<Reservation> {
  reservationId = getContract.params.parse({ reservationId }).reservationId;
  getContract.body.parse(input);
  const row = await readReservation(db, reservationId);
  if (!row) throw new TripNotFoundError();
  const role = await requireTripRole(row.tripId, actor.userId, "viewer");
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.reservationId, reservationId))
    .orderBy(sql`${documents.addedAt} desc nulls last`, asc(documents.id));
  const costs =
    role === "viewer"
      ? []
      : await db.select().from(expenses).where(eq(expenses.reservationId, reservationId)).orderBy(expenses.id);
  const cost = costs.at(-1);
  return {
    ...dbReservationToType(row),
    ...(cost ? { expense: dbExpenseToType(cost) } : {}),
    documents: docs.map(dbDocToType),
  };
}

/** An empty time and `null` both clear; a time is stored as the instant it names. */
function patchTime(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

/** Explicit allow-list: a patch can never reach `id`, `tripId`, `type` or the timestamps. */
function columnChanges(patch: ReservationPatch): ReservationChanges {
  const changes: ReservationChanges = {};
  if (patch.provider !== undefined) changes.provider = patch.provider.trim();
  if (patch.startAt !== undefined) changes.startAt = patchTime(patch.startAt);
  if (patch.endAt !== undefined) changes.endAt = patchTime(patch.endAt);
  for (const side of ["start", "end"] as const) {
    const address = patch[`${side}Address`];
    if (address === undefined) continue;
    const name = `${side}LocationName` as const;
    const lat = `${side}LocationLat` as const;
    const lng = `${side}LocationLng` as const;
    changes[`${side}Address`] = address || null;
    if (!address) {
      changes[name] = null;
      changes[lat] = null;
      changes[lng] = null;
      continue;
    }
    if (patch[name] !== undefined) changes[name] = patch[name] || null;
    if (patch[lat] !== undefined) changes[lat] = patch[lat];
    if (patch[lng] !== undefined) changes[lng] = patch[lng];
  }
  if (patch.confirmationCode !== undefined) changes.confirmationCode = patch.confirmationCode || null;
  if (patch.serviceNumber !== undefined) changes.serviceNumber = patch.serviceNumber || null;
  if (patch.notes !== undefined) changes.notes = patch.notes || null;
  return changes;
}

function sameValue(stored: unknown, next: unknown): boolean {
  if (stored instanceof Date || next instanceof Date)
    return (stored as Date | null)?.getTime() === (next as Date | null)?.getTime();
  return (stored ?? null) === (next ?? null);
}

/**
 * Applies only the supplied fields under the trip lock: absent leaves a column alone and `null` clears it. Clearing an
 * address clears its location name, latitude and longitude. The merged times are validated, and a date that leaves the
 * trip widens it (up to 45 days). A patch that changes nothing returns the stored row and writes nothing.
 */
export async function updateReservation(
  actor: Actor,
  reservationId: string,
  input: unknown,
  replay?: IdempotentRequest
): Promise<Reservation> {
  reservationId = updateContract.params.parse({ reservationId }).reservationId;
  const patch = updateContract.body.parse(input);
  const found = await readReservation(db, reservationId);
  if (!found) throw new TripNotFoundError();
  const tripId = found.tripId;
  await requireTripRole(tripId, actor.userId, "editor");
  return runTripWrite<Reservation>(actor, tripId, { replay, payload: patch }, (transaction, markChanged) => ({
    authorize: async () => {
      await lockTrip(transaction, tripId);
      const current = await readReservation(transaction, reservationId);
      if (!current || current.tripId !== tripId) throw new TripNotFoundError();
      await requireTripRole(tripId, actor.userId, "editor", transaction);
    },
    mutate: async () => {
      const current = await readReservation(transaction, reservationId);
      if (!current) throw new TripNotFoundError();
      const changes = columnChanges(patch);
      const changedKeys = (Object.keys(changes) as (keyof ReservationChanges)[]).filter(
        (key) => !sameValue(current[key], changes[key])
      );
      if (changedKeys.length === 0) return dbReservationToType(current);

      const nextStartAt = (changes.startAt === undefined ? current.startAt : changes.startAt)?.toISOString();
      const nextEndAt = (changes.endAt === undefined ? current.endAt : changes.endAt)?.toISOString();
      if (REQUIRES_END_AT.includes(current.type as ReservationType) && !nextEndAt)
        throw new ValidationFailedError("An end date and time is required for this reservation type.");
      if (nextEndAt && !nextStartAt)
        throw new ValidationFailedError("A start date and time is required when an end date and time is set.");
      if (nextStartAt && nextEndAt && new Date(nextEndAt).getTime() < new Date(nextStartAt).getTime())
        throw new ValidationFailedError("The end date and time must be after the start date and time.");

      const dateChanged =
        (changedKeys.includes("startAt") &&
          nextStartAt?.slice(0, 10) !== current.startAt?.toISOString().slice(0, 10)) ||
        (changedKeys.includes("endAt") && nextEndAt?.slice(0, 10) !== current.endAt?.toISOString().slice(0, 10));
      if (dateChanged) {
        const [trip] = await transaction
          .select({ startDate: trips.startDate, endDate: trips.endDate })
          .from(trips)
          .where(eq(trips.id, tripId));
        if (!trip) throw new TripNotFoundError();
        try {
          await extendTripDateRange(
            transaction,
            tripId,
            trip.startDate ?? undefined,
            trip.endDate ?? undefined,
            nextStartAt,
            nextEndAt
          );
        } catch (error) {
          if (error instanceof Error && error.message === TRIP_LIMIT_MESSAGE)
            throw new ValidationFailedError(error.message);
          throw error;
        }
      }

      const [updated] = await transaction
        .update(reservations)
        .set({ ...changes, updatedAt: getNow() })
        .where(eq(reservations.id, reservationId))
        .returning();
      if (!updated) throw new TripNotFoundError();
      markChanged();
      return dbReservationToType(updated);
    },
  }));
}
