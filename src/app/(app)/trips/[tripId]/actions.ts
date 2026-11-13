"use server";

import { recordTripUpdated } from "@/lib/trip-activity";
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { trips } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getContributorsAndInvitations } from "@/lib/queries";
import { resendInvitation } from "@/lib/invitations";
import { deriveGraphicCover } from "@/lib/utils";
import { assertValidCoverImageUrl, assertValidPhotographerUrl } from "@/lib/url-policy";

import { lockTripForUpdate } from "@/lib/server-action-locks";
import { publishTripEvent } from "@/lib/trip-events";
import { LiveSyncEventType } from "@/data/types";
import {
  dismissInvitation,
  rescindInvitation,
  saveContributorChanges as saveContributorChangesAction,
} from "../actions";
import { uploadCoverImage as uploadCoverImageAction } from "./cover-upload-actions";
import type { ContributorChange } from "@/data/types";

export async function getShareDialogData(tripId: string) {
  const user = await requireUser();
  return getContributorsAndInvitations(tripId, user.id!);
}

export async function resendShareInvitation(tripId: string, invitationId: string) {
  const user = await requireUser();
  const result = await resendInvitation(invitationId, tripId, user.id!);
  if (result.status === "success") {
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

export async function rescindShareInvitation(tripId: string, invitationId: string) {
  const result = await rescindInvitation(tripId, invitationId);
  if (result.status === "success") {
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

export async function dismissShareInvitation(tripId: string, invitationId: string) {
  const result = await dismissInvitation(tripId, invitationId);
  if (result.status === "success") {
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

export async function saveContributorChanges(tripId: string, changes: ContributorChange[]) {
  const result = await saveContributorChangesAction(tripId, changes);
  if (result.status === "success") {
    revalidatePath(`/trips/${tripId}`);
  }
  return result;
}

function publishItineraryChanged(tripId: string): void {
  publishTripEvent(tripId, { type: LiveSyncEventType.ItineraryChanged, tripId });
}

export async function setTripCoverWithAttribution(
  tripId: string,
  coverImageUrl: string,
  coverPhotographer?: string | null,
  coverPhotographerUrl?: string | null
): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  assertValidCoverImageUrl(coverImageUrl, tripId);
  if (coverPhotographerUrl) assertValidPhotographerUrl(coverPhotographerUrl);
  await db
    .update(trips)
    .set({
      coverImageUrl,
      coverPhotographer: coverPhotographer ?? null,
      coverPhotographerUrl: coverPhotographerUrl ?? null,
    })
    .where(eq(trips.id, tripId));
  recordTripUpdated(user.id!, tripId);
  publishItineraryChanged(tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function removeTripCover(tripId: string): Promise<void> {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");

  await db.transaction(async (transaction) => {
    await lockTripForUpdate(transaction, tripId);

    const [trip] = await transaction.select({ name: trips.name }).from(trips).where(eq(trips.id, tripId)).limit(1);
    if (!trip) throw new Error("Trip not found");

    await transaction
      .update(trips)
      .set({
        coverImageUrl: deriveGraphicCover(trip.name),
        coverPhotographer: null,
        coverPhotographerUrl: null,
      })
      .where(eq(trips.id, tripId));
  });

  recordTripUpdated(user.id!, tripId);
  publishItineraryChanged(tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function uploadCoverImage(tripId: string, formData: FormData): Promise<string> {
  return uploadCoverImageAction(tripId, formData);
}
