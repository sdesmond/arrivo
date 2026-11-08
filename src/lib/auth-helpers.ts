import "server-only";
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import type { CollaboratorRole } from "@/data/types";
import { isAppAdmin } from "@/lib/app-roles";
import { requireTripRole, TripNotFoundError, TripForbiddenError } from "@/lib/services/trip-access";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireEnrollmentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireUser() {
  const user = await requireEnrollmentUser();
  if (user.mfaEnrollmentRequired) redirect("/mfa-enrollment");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!(await isAppAdmin(user.id!))) notFound();
  return user;
}

// Every Server Action MUST call this before any write, even if the query layer
// also calls it. Defense-in-depth — actions can be invoked directly via the
// wire format and must not trust caller context.
export async function assertTripAccess(
  tripId: string,
  userId: string,
  minRole: CollaboratorRole = "viewer"
): Promise<CollaboratorRole> {
  try {
    return await requireTripRole(tripId, userId, minRole);
  } catch (error) {
    if (error instanceof TripNotFoundError || error instanceof TripForbiddenError) notFound();
    throw error;
  }
}
