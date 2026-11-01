"use server";

import { recordTripUpdated } from "@/lib/trip-activity";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { trips } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { TransitMode } from "@/data/types";
import { isTransitMode } from "@/lib/db-mappers";

export async function updateTripTransitMode(
  tripId: string,
  transitMode: TransitMode
): Promise<{ success: true } | { error: string }> {
  const user = await requireUser();

  if (!isTransitMode(transitMode)) {
    return { error: "Invalid transit mode." };
  }

  await assertTripAccess(tripId, user.id!, "editor");

  await db.update(trips).set({ transitMode }).where(eq(trips.id, tripId));
  recordTripUpdated(user.id!, tripId);
  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}
