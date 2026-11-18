"use server";

import { requireUser } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";

import { resendInvitation } from "@/lib/invitations";

import { dismissInvitation, rescindInvitation } from "../actions";

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
