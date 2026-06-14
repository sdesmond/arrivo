"use server";

import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { reservations } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { ReservationType, type CreateReservationInput } from "@/data/types";

const REQUIRES_END_AT: ReservationType[] = [ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise];

export async function createReservation(tripId: string, input: CreateReservationInput): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  if (REQUIRES_END_AT.includes(input.type) && !input.endAt) {
    throw new Error("An end date and time is required for this reservation type.");
  }

  await db.insert(reservations).values({
    tripId,
    type: input.type,
    provider: input.provider,
    startAt: input.startAt ? new Date(input.startAt) : undefined,
    endAt: input.endAt ? new Date(input.endAt) : undefined,
    confirmationCode: input.confirmationCode,
    notes: input.notes,
  });

  revalidatePath(`/trips/${tripId}`);
}
