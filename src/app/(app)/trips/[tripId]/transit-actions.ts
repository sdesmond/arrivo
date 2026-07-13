"use server";

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
  await assertTripAccess(tripId, user.id!, "editor");

  if (!isTransitMode(transitMode)) {
    return { error: "Invalid transit mode." };
  }

  await db.update(trips).set({ transitMode }).where(eq(trips.id, tripId));
  revalidatePath(`/trips/${tripId}`);
  return { success: true };
}
