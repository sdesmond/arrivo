"use server";

import { requireUser } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

import { getContributorsAndInvitations } from "@/lib/queries";
import { resendInvitation } from "@/lib/invitations";

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

export async function uploadCoverImage(tripId: string, formData: FormData): Promise<string> {
  return uploadCoverImageAction(tripId, formData);
}
