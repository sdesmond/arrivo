"use server";

import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/db";
import { users, collaborators, trips, userLoyaltyNumbers, userWishlistDestinations, userCompanions } from "@/db/schema";
import { eq, and, not, exists, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import bcrypt from "bcryptjs";
import type {
  UpdateUserProfilePatch,
  AddLoyaltyNumberInput,
  AddWishlistDestinationInput,
  AddCompanionInput,
  UpdateCompanionPatch,
} from "@/data/types";

export async function updateProfile(patch: UpdateUserProfilePatch): Promise<void> {
  const session = await requireUser();
  await db.update(users).set(patch).where(eq(users.id, session.id!));
  revalidatePath("/profile");
  revalidatePath("/trips");
}

export async function addLoyaltyNumber(input: AddLoyaltyNumberInput): Promise<void> {
  const session = await requireUser();
  const userId = session.id!;
  const [{ nextPos }] = await db
    .select({ nextPos: sql<number>`coalesce(max(${userLoyaltyNumbers.position}), -1) + 1` })
    .from(userLoyaltyNumbers)
    .where(eq(userLoyaltyNumbers.userId, userId));
  await db.insert(userLoyaltyNumbers).values({
    userId,
    programName: input.programName,
    memberNumber: input.memberNumber,
    position: nextPos,
  });
  revalidatePath("/profile");
}

export async function deleteLoyaltyNumber(id: string): Promise<void> {
  const session = await requireUser();
  await db
    .delete(userLoyaltyNumbers)
    .where(and(eq(userLoyaltyNumbers.id, id), eq(userLoyaltyNumbers.userId, session.id!)));
  revalidatePath("/profile");
}

export async function addWishlistDestination(input: AddWishlistDestinationInput): Promise<void> {
  const session = await requireUser();
  const userId = session.id!;
  const [{ nextPos }] = await db
    .select({ nextPos: sql<number>`coalesce(max(${userWishlistDestinations.position}), -1) + 1` })
    .from(userWishlistDestinations)
    .where(eq(userWishlistDestinations.userId, userId));
  await db.insert(userWishlistDestinations).values({ userId, name: input.name, position: nextPos });
  revalidatePath("/profile");
}

export async function deleteWishlistDestination(id: string): Promise<void> {
  const session = await requireUser();
  await db
    .delete(userWishlistDestinations)
    .where(and(eq(userWishlistDestinations.id, id), eq(userWishlistDestinations.userId, session.id!)));
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

export async function addCompanion(input: AddCompanionInput): Promise<{ error?: string }> {
  const session = await requireUser();
  const userId = session.id!;

  const trimmedName = input.name?.trim() ?? "";
  if (!trimmedName) return { error: "Companion name is required." };
  if (trimmedName.length > 100) return { error: "Companion name must be 100 characters or fewer." };

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userCompanions)
    .where(eq(userCompanions.userId, userId));
  if (count >= 20) return { error: "Companion limit reached (20 maximum)." };

  const [{ nextPos }] = await db
    .select({ nextPos: sql<number>`coalesce(max(${userCompanions.position}), -1) + 1` })
    .from(userCompanions)
    .where(eq(userCompanions.userId, userId));

  await db.insert(userCompanions).values({
    userId,
    name: trimmedName,
    age: input.age ?? null,
    position: nextPos,
  });
  revalidatePath("/profile");
  return {};
}

export async function updateCompanion(id: string, patch: UpdateCompanionPatch): Promise<{ error?: string }> {
  const session = await requireUser();

  if (patch.name !== undefined) {
    const trimmedName = patch.name.trim();
    if (trimmedName.length > 100) return { error: "Companion name must be 100 characters or fewer." };
  }
  if (patch.age !== undefined && patch.age !== null) {
    if (!Number.isInteger(patch.age) || patch.age < 0 || patch.age > 120) {
      return { error: "Age must be between 0 and 120." };
    }
  }

  await db
    .update(userCompanions)
    .set({
      name: patch.name,
      age: patch.age ?? null,
      passportNumber: patch.passportNumber ?? null,
      passportExpiry: patch.passportExpiry ?? null,
      passportNationality: patch.passportNationality ?? null,
      knownTravelerNumber: patch.knownTravelerNumber ?? null,
      packtUsername: patch.packtUsername ?? null,
    })
    .where(and(eq(userCompanions.id, id), eq(userCompanions.userId, session.id!)));
  revalidatePath("/profile");
  return {};
}

export async function deleteCompanion(id: string): Promise<void> {
  const session = await requireUser();
  await db.delete(userCompanions).where(and(eq(userCompanions.id, id), eq(userCompanions.userId, session.id!)));
  revalidatePath("/profile");
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
