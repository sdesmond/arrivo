"use server";

import { asc, eq, sql } from "drizzle-orm";
import { put, del } from "@vercel/blob";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations, documents, days, trips } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { MAX_UPLOAD_BYTES, inferDocKind, formatFileSize } from "@/lib/utils";
import { saveLocalUpload } from "@/lib/local-upload";
import { ReservationType, type CreateReservationInput, type UpdateReservationPatch } from "@/data/types";

const REQUIRES_END_AT: ReservationType[] = [ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise];
const MAX_TRIP_DAYS = 45;
const DAY_NUMBER_SHIFT_OFFSET = 1000;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function nextCalendarDate(date: string): string {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

async function extendTripDateRange(
  transaction: DbTransaction,
  tripId: string,
  tripStartDate: string | undefined,
  tripEndDate: string | undefined,
  reservationStartAt: string | undefined,
  reservationEndAt: string | undefined
): Promise<{ newStartDate?: string; newEndDate?: string }> {
  const reservationStartDate = reservationStartAt?.slice(0, 10);
  const reservationEndDate = reservationEndAt?.slice(0, 10);
  const reservationDates = [reservationStartDate, reservationEndDate].filter((date): date is string => !!date).sort();
  const earliestReservationDate = reservationDates[0];
  const latestReservationDate = reservationDates.at(-1);

  const needsStartExtension = !!earliestReservationDate && (!tripStartDate || earliestReservationDate < tripStartDate);
  const needsEndExtension = !!latestReservationDate && (!tripEndDate || latestReservationDate > tripEndDate);
  if (!needsStartExtension && !needsEndExtension) {
    return {};
  }

  const newStartDate = needsStartExtension ? earliestReservationDate : (tripStartDate ?? latestReservationDate);
  const newEndDate = needsEndExtension ? latestReservationDate : (tripEndDate ?? earliestReservationDate);
  if (!newStartDate || !newEndDate) {
    return {};
  }

  const newRangeSpanMs =
    new Date(`${newEndDate}T00:00:00.000Z`).getTime() - new Date(`${newStartDate}T00:00:00.000Z`).getTime();
  const newRangeSpanDays = Math.round(newRangeSpanMs / (24 * 60 * 60 * 1000)) + 1;
  if (newRangeSpanDays > MAX_TRIP_DAYS) {
    throw new Error("Trip cannot exceed 45 days.");
  }

  const existingDayCount =
    (
      await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(days)
        .where(eq(days.tripId, tripId))
    )[0]?.count ?? 0;

  const allDates: string[] = [];
  let cursor = newStartDate;
  while (cursor <= newEndDate) {
    allDates.push(cursor);
    cursor = nextCalendarDate(cursor);
  }

  const existingDayDates = new Set(
    (await transaction.select({ date: days.date }).from(days).where(eq(days.tripId, tripId)))
      .map((day) => day.date)
      .filter((date): date is string => !!date)
  );

  const newDateStrings = allDates.filter((date) => !existingDayDates.has(date));
  const totalDaysAfter = existingDayCount + newDateStrings.length;
  if (totalDaysAfter > MAX_TRIP_DAYS) {
    throw new Error("Trip cannot exceed 45 days.");
  }

  const sortedDatesForInsert = [...newDateStrings].sort((leftDate, rightDate) => {
    const leftIsBeforeRange = !!tripStartDate && leftDate < tripStartDate;
    const rightIsBeforeRange = !!tripStartDate && rightDate < tripStartDate;
    if (leftIsBeforeRange && rightIsBeforeRange) {
      return rightDate.localeCompare(leftDate);
    }
    if (!leftIsBeforeRange && !rightIsBeforeRange) {
      return leftDate.localeCompare(rightDate);
    }
    return leftIsBeforeRange ? -1 : 1;
  });

  for (const date of sortedDatesForInsert) {
    const isBeforeRange = !!tripStartDate && date < tripStartDate;
    if (isBeforeRange) {
      await transaction
        .update(days)
        .set({
          dayNumber: sql`${days.dayNumber} + ${DAY_NUMBER_SHIFT_OFFSET}`,
          label: sql`concat('Day ', ${days.dayNumber} + ${DAY_NUMBER_SHIFT_OFFSET})`,
        })
        .where(eq(days.tripId, tripId));
      await transaction
        .update(days)
        .set({
          dayNumber: sql`${days.dayNumber} - ${DAY_NUMBER_SHIFT_OFFSET - 1}`,
          label: sql`concat('Day ', ${days.dayNumber} - ${DAY_NUMBER_SHIFT_OFFSET - 1})`,
        })
        .where(eq(days.tripId, tripId));

      await transaction.insert(days).values({
        tripId,
        dayNumber: 1,
        date,
        label: "Day 1",
      });
      continue;
    }

    const existingDays = await transaction
      .select({ dayNumber: days.dayNumber })
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.dayNumber));
    const nextDayNumber = (existingDays.at(-1)?.dayNumber ?? 0) + 1;

    await transaction.insert(days).values({
      tripId,
      dayNumber: nextDayNumber,
      date,
      label: `Day ${nextDayNumber}`,
    });
  }

  const tripUpdates: Record<string, string | Date> = { updatedAt: new Date() };
  if (needsStartExtension) {
    tripUpdates.startDate = newStartDate;
  }
  if (needsEndExtension) {
    tripUpdates.endDate = newEndDate;
  }

  await transaction.update(trips).set(tripUpdates).where(eq(trips.id, tripId));

  return {
    newStartDate: needsStartExtension ? newStartDate : undefined,
    newEndDate: needsEndExtension ? newEndDate : undefined,
  };
}

async function getReservationTripId(reservationId: string): Promise<string> {
  const [reservation] = await db
    .select({ tripId: reservations.tripId })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  return reservation.tripId;
}

export async function createReservation(tripId: string, input: CreateReservationInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  if (!Object.values(ReservationType).includes(input.type)) {
    throw new Error("Invalid reservation type.");
  }

  if (!input.provider.trim()) {
    throw new Error("Provider is required.");
  }

  if (REQUIRES_END_AT.includes(input.type) && !input.endAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  await db.transaction(async (transaction) => {
    const [trip] = await transaction
      .select({ startDate: trips.startDate, endDate: trips.endDate })
      .from(trips)
      .where(eq(trips.id, tripId));
    if (!trip) {
      throw new Error("Trip not found.");
    }

    await extendTripDateRange(
      transaction,
      tripId,
      trip.startDate ?? undefined,
      trip.endDate ?? undefined,
      input.startAt,
      input.endAt
    );

    await transaction.insert(reservations).values({
      tripId,
      type: input.type,
      provider: input.provider.trim(),
      startAt: input.startAt ? new Date(input.startAt) : undefined,
      endAt: input.endAt ? new Date(input.endAt) : undefined,
      startAddress: input.startAddress,
      startLocationName: input.startLocationName,
      startLocationLat: input.startLocationLat,
      startLocationLng: input.startLocationLng,
      endAddress: input.endAddress,
      endLocationName: input.endLocationName,
      endLocationLat: input.endLocationLat,
      endLocationLng: input.endLocationLng,
      cost: input.cost != null ? String(input.cost) : undefined,
      confirmationCode: input.confirmationCode,
      serviceNumber: input.serviceNumber,
      notes: input.notes,
    });
  });

  revalidatePath(`/trips/${tripId}`);
}

export async function updateReservation(reservationId: string, patch: UpdateReservationPatch): Promise<void> {
  const user = await requireUser();

  const [existing] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!existing) {
    throw new Error("Reservation not found.");
  }

  await assertTripAccess(existing.tripId, user.id!, "editor");

  if (patch.provider !== undefined && !patch.provider.trim()) {
    throw new Error("Provider is required.");
  }

  if (patch.startAt && Number.isNaN(new Date(patch.startAt).getTime())) {
    throw new Error("Invalid start date and time.");
  }

  if (patch.endAt && Number.isNaN(new Date(patch.endAt).getTime())) {
    throw new Error("Invalid end date and time.");
  }

  const type = existing.type as ReservationType;
  const nextStartAt = patch.startAt !== undefined ? patch.startAt || undefined : existing.startAt?.toISOString();
  const nextEndAt = patch.endAt !== undefined ? patch.endAt || undefined : existing.endAt?.toISOString();
  const existingStartDate = existing.startAt?.toISOString().slice(0, 10);
  const existingEndDate = existing.endAt?.toISOString().slice(0, 10);
  const nextStartDate = nextStartAt?.slice(0, 10);
  const nextEndDate = nextEndAt?.slice(0, 10);
  const reservationDateChanged =
    (patch.startAt !== undefined && nextStartDate !== existingStartDate) ||
    (patch.endAt !== undefined && nextEndDate !== existingEndDate);

  if (REQUIRES_END_AT.includes(type) && !nextEndAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  if (nextEndAt && !nextStartAt) {
    throw new Error("A start date and time is required when an end date and time is set.");
  }

  if (nextStartAt && nextEndAt && new Date(nextEndAt).getTime() < new Date(nextStartAt).getTime()) {
    throw new Error("The end date and time must be after the start date and time.");
  }

  await db.transaction(async (transaction) => {
    const [trip] = await transaction
      .select({ startDate: trips.startDate, endDate: trips.endDate })
      .from(trips)
      .where(eq(trips.id, existing.tripId));
    if (!trip) {
      throw new Error("Trip not found.");
    }

    if (reservationDateChanged) {
      await extendTripDateRange(
        transaction,
        existing.tripId,
        trip.startDate ?? undefined,
        trip.endDate ?? undefined,
        nextStartAt,
        nextEndAt
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.provider !== undefined) updates.provider = patch.provider.trim();
    if (patch.startAt !== undefined) updates.startAt = patch.startAt ? new Date(patch.startAt) : null;
    if (patch.endAt !== undefined) updates.endAt = patch.endAt ? new Date(patch.endAt) : null;
    if (patch.startAddress !== undefined) {
      updates.startAddress = patch.startAddress || null;
      if (!patch.startAddress) {
        updates.startLocationName = null;
        updates.startLocationLat = null;
        updates.startLocationLng = null;
      } else {
        if (patch.startLocationName !== undefined) updates.startLocationName = patch.startLocationName || null;
        if (patch.startLocationLat !== undefined) updates.startLocationLat = patch.startLocationLat;
        if (patch.startLocationLng !== undefined) updates.startLocationLng = patch.startLocationLng;
      }
    }
    if (patch.endAddress !== undefined) {
      updates.endAddress = patch.endAddress || null;
      if (!patch.endAddress) {
        updates.endLocationName = null;
        updates.endLocationLat = null;
        updates.endLocationLng = null;
      } else {
        if (patch.endLocationName !== undefined) updates.endLocationName = patch.endLocationName || null;
        if (patch.endLocationLat !== undefined) updates.endLocationLat = patch.endLocationLat;
        if (patch.endLocationLng !== undefined) updates.endLocationLng = patch.endLocationLng;
      }
    }
    if (patch.cost !== undefined) updates.cost = patch.cost != null ? String(patch.cost) : null;
    if (patch.confirmationCode !== undefined) updates.confirmationCode = patch.confirmationCode || null;
    if (patch.serviceNumber !== undefined) updates.serviceNumber = patch.serviceNumber || null;
    if (patch.notes !== undefined) updates.notes = patch.notes || null;

    await transaction.update(reservations).set(updates).where(eq(reservations.id, reservationId));
  });

  revalidatePath(`/trips/${existing.tripId}`);
}

export async function deleteReservation(reservationId: string): Promise<void> {
  const user = await requireUser();

  const [existing] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!existing) {
    // Already deleted — treat as success (idempotent; guards against collaborator-race double-fire).
    return;
  }

  await assertTripAccess(existing.tripId, user.id!, "editor");

  const attachedDocs = await db.select().from(documents).where(eq(documents.reservationId, reservationId));
  const blobUrls = attachedDocs.map((doc) => doc.url).filter(Boolean) as string[];
  if (blobUrls.length > 0 && process.env.UPLOAD_STUB !== "true") {
    // Best-effort cleanup: a transient blob-store error must not block the DB delete.
    try {
      await del(blobUrls);
    } catch {
      // Orphaned blobs are tolerable; a blocked reservation delete is not.
    }
  }

  await db.delete(reservations).where(eq(reservations.id, reservationId));

  revalidatePath(`/trips/${existing.tripId}`);
}

export async function uploadReservationDocument(reservationId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!reservation) throw new Error("Reservation not found.");
  await assertTripAccess(reservation.tripId, user.id!, "editor");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`File is too large. Max ${formatFileSize(MAX_UPLOAD_BYTES)}.`);

  const kind = inferDocKind(file.type);
  const isStub = process.env.UPLOAD_STUB === "true";
  const url = isStub ? await saveLocalUpload(file) : (await put(file.name, file, { access: "public" })).url;

  try {
    await db.insert(documents).values({
      tripId: reservation.tripId,
      reservationId,
      name: file.name,
      kind,
      size: formatFileSize(file.size),
      url,
    });
  } catch (error) {
    // Roll back the just-uploaded blob so a failed insert does not leak storage.
    if (!isStub) {
      try {
        await del(url);
      } catch {
        // Swallow rollback failure; surface the original insert error below.
      }
    }
    throw error;
  }

  revalidatePath(`/trips/${reservation.tripId}`);
}

export async function removeReservationDocument(docId: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  if (!doc.reservationId) throw new Error("Document is not attached to a reservation.");

  const [reservation] = await db.select().from(reservations).where(eq(reservations.id, doc.reservationId));
  if (!reservation) throw new Error("Reservation not found.");

  await assertTripAccess(reservation.tripId, user.id!, "editor");

  if (doc.url && process.env.UPLOAD_STUB !== "true") {
    // Best-effort cleanup: a transient blob-store error must not block the DB delete.
    try {
      await del(doc.url);
    } catch {
      // Orphaned blob is tolerable; a blocked document delete is not.
    }
  }

  await db.delete(documents).where(eq(documents.id, docId));
  revalidatePath(`/trips/${reservation.tripId}`);
}

export async function renameReservationDocument(docId: string, newName: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.reservationId ? await getReservationTripId(doc.reservationId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ name: newName }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}

export async function promoteReservationDocToTrip(docId: string): Promise<void> {
  const user = await requireUser();
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return;
  const tripId = doc.tripId ?? (doc.reservationId ? await getReservationTripId(doc.reservationId) : null);
  if (!tripId) return;
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ tripId, reservationId: null }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}

export async function attachTripDocToReservation(docId: string, reservationId: string): Promise<void> {
  const user = await requireUser();
  const tripId = await getReservationTripId(reservationId);
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(documents).set({ reservationId }).where(eq(documents.id, docId));
  revalidatePath(`/trips/${tripId}`);
}
