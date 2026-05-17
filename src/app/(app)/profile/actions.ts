"use server";

import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/db";
import { users, collaborators, trips } from "@/db/schema";
import { eq, and, not, exists } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import bcrypt from "bcryptjs";
import type { UpdateUserProfilePatch } from "@/data/types";

export async function updateProfile(patch: UpdateUserProfilePatch): Promise<void> {
  const session = await requireUser();
  await db.update(users).set(patch).where(eq(users.id, session.id!));
  revalidatePath("/profile");
}

export async function changePassword({
  currentPassword,
  newPassword,
}: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ error?: string }> {
  const session = await requireUser();
  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.id!));

  if (!user?.passwordHash) return { error: "No password set on this account." };

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) return { error: "Current password is incorrect." };

  if (newPassword.length < 8) return { error: "New password must be at least 8 characters." };

  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, session.id!));
  return {};
}

export async function deleteAccount(): Promise<void> {
  const session = await requireUser();
  const userId = session.id!;

  // Delete trips where user is the sole owner (no other collaborators with owner role)
  const ownedTripIds = await db
    .select({ id: trips.id })
    .from(trips)
    .where(
      and(
        eq(trips.ownerId, userId),
        not(
          exists(
            db
              .select()
              .from(collaborators)
              .where(and(eq(collaborators.tripId, trips.id), not(eq(collaborators.userId, userId))))
          )
        )
      )
    );

  for (const { id } of ownedTripIds) {
    await db.delete(trips).where(eq(trips.id, id));
  }

  // Remove from remaining trips as collaborator
  await db.delete(collaborators).where(eq(collaborators.userId, userId));

  // Delete user (cascades to accounts, sessions, etc.)
  await db.delete(users).where(eq(users.id, userId));

  await signOut({ redirectTo: "/sign-in" });
}
