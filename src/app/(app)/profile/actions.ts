"use server";

import { requireUser } from "@/lib/auth-helpers";
import { db } from "@/db";
import { users, collaborators, trips, userLoyaltyNumbers, userWishlistDestinations, userCompanions } from "@/db/schema";
import { eq, and, not, exists, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import bcrypt from "bcryptjs";
import { CoverType } from "@/data/types";
import type {
  UpdateUserProfilePatch,
  AddLoyaltyNumberInput,
  AddWishlistDestinationInput,
  AddCompanionInput,
  UpdateCompanionPatch,
} from "@/data/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COMPANION_LIMIT_EXCEEDED = "CAP_EXCEEDED";

export async function updateProfile(patch: UpdateUserProfilePatch): Promise<{ error?: string }> {
  const session = await requireUser();

  // Trim name and validate the trimmed value; normalize empty string to null
  const trimmedName = patch.name !== undefined ? patch.name.trim() : undefined;
  if (trimmedName !== undefined && trimmedName.length > 100) {
    return { error: "Name must be 100 characters or fewer." };
  }
  if (patch.passportNumber !== undefined && patch.passportNumber !== null) {
    if (patch.passportNumber.length > 20) return { error: "Passport number must be 20 characters or fewer." };
  }
  if (patch.passportNationality !== undefined && patch.passportNationality !== null) {
    if (patch.passportNationality.length > 50) return { error: "Nationality must be 50 characters or fewer." };
  }
  if (patch.knownTravelerNumber !== undefined && patch.knownTravelerNumber !== null) {
    if (patch.knownTravelerNumber.length > 20)
      return { error: "Known traveler number must be 20 characters or fewer." };
  }
  if (patch.currency !== undefined && patch.currency !== "") {
    if (!/^[A-Z]{3}$/.test(patch.currency)) return { error: "Currency must be a 3-letter ISO code." };
  }
  if (patch.dateFormat !== undefined) {
    if (!["MM/DD/YYYY", "DD/MM/YYYY"].includes(patch.dateFormat)) return { error: "Invalid date format." };
  }
  if (patch.distanceUnit !== undefined) {
    if (!["imperial", "metric"].includes(patch.distanceUnit)) return { error: "Invalid distance unit." };
  }
  if (patch.defaultCoverType !== undefined) {
    const validCoverTypes = Object.values(CoverType) as string[];
    if (!validCoverTypes.includes(patch.defaultCoverType)) {
      return { error: "Invalid cover type." };
    }
  }
  if (patch.passportExpiry !== undefined && !DATE_RE.test(patch.passportExpiry)) {
    return { error: "Passport expiry must be a valid date (YYYY-MM-DD)." };
  }

  const dbPatch: Omit<UpdateUserProfilePatch, "name"> & { name?: string | null } = { ...patch };
  if (trimmedName !== undefined) dbPatch.name = trimmedName || null;

  try {
    await db.update(users).set(dbPatch).where(eq(users.id, session.id!));
  } catch {
    return { error: "Something went wrong." };
  }
  revalidatePath("/profile");
  revalidatePath("/trips");
  return {};
}

export async function addLoyaltyNumber(input: AddLoyaltyNumberInput): Promise<void> {
  const session = await requireUser();
  if (input.programName.length > 100) throw new Error("Program name must be 100 characters or fewer.");
  if (input.memberNumber.length > 50) throw new Error("Member number must be 50 characters or fewer.");
  const userId = session.id!;
  await db.transaction(async (transaction) => {
    const [{ nextPos }] = await transaction
      .select({ nextPos: sql<number>`coalesce(max(${userLoyaltyNumbers.position}), -1) + 1` })
      .from(userLoyaltyNumbers)
      .where(eq(userLoyaltyNumbers.userId, userId));
    await transaction.insert(userLoyaltyNumbers).values({
      userId,
      programName: input.programName,
      memberNumber: input.memberNumber,
      position: nextPos,
    });
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
  if (input.name.length > 100) throw new Error("Destination name must be 100 characters or fewer.");
  const userId = session.id!;
  await db.transaction(async (transaction) => {
    const [{ nextPos }] = await transaction
      .select({ nextPos: sql<number>`coalesce(max(${userWishlistDestinations.position}), -1) + 1` })
      .from(userWishlistDestinations)
      .where(eq(userWishlistDestinations.userId, userId));
    await transaction.insert(userWishlistDestinations).values({ userId, name: input.name, position: nextPos });
  });
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
  try {
    await db.update(users).set({ passwordHash: hash }).where(eq(users.id, session.id!));
  } catch {
    return { error: "Something went wrong." };
  }
  return {};
}

export async function addCompanion(input: AddCompanionInput): Promise<{ error?: string }> {
  const session = await requireUser();
  const userId = session.id!;

  const trimmedName = input.name?.trim() ?? "";
  if (!trimmedName) return { error: "Companion name is required." };
  if (trimmedName.length > 50) return { error: "Companion name must be 50 characters or fewer." };

  try {
    await db.transaction(async (transaction) => {
      const [{ count }] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(userCompanions)
        .where(eq(userCompanions.userId, userId));
      if (count >= 20) {
        throw new Error(COMPANION_LIMIT_EXCEEDED);
      }

      const [{ nextPos }] = await transaction
        .select({ nextPos: sql<number>`coalesce(max(${userCompanions.position}), -1) + 1` })
        .from(userCompanions)
        .where(eq(userCompanions.userId, userId));

      await transaction.insert(userCompanions).values({
        userId,
        name: trimmedName,
        age: input.age ?? null,
        position: nextPos,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === COMPANION_LIMIT_EXCEEDED) {
      return { error: "Companion limit reached (20 maximum)." };
    }
    return { error: "Something went wrong." };
  }
  revalidatePath("/profile");
  return {};
}

export async function updateCompanion(id: string, patch: UpdateCompanionPatch): Promise<{ error?: string }> {
  const session = await requireUser();

  const trimmedName = patch.name !== undefined ? patch.name.trim() : undefined;
  if (trimmedName !== undefined) {
    if (!trimmedName) return { error: "Companion name is required." };
    if (trimmedName.length > 50) return { error: "Companion name must be 50 characters or fewer." };
  }
  if (patch.age !== undefined && patch.age !== null) {
    if (!Number.isInteger(patch.age) || patch.age < 0 || patch.age > 120) {
      return { error: "Age must be between 0 and 120." };
    }
  }
  if (patch.passportExpiry !== undefined && !DATE_RE.test(patch.passportExpiry)) {
    return { error: "Passport expiry must be a valid date (YYYY-MM-DD)." };
  }

  let updated: { id: string }[];
  try {
    updated = await db
      .update(userCompanions)
      .set({
        name: trimmedName,
        age: patch.age ?? null,
        passportNumber: patch.passportNumber ?? null,
        passportExpiry: patch.passportExpiry ?? null,
        passportNationality: patch.passportNationality ?? null,
        knownTravelerNumber: patch.knownTravelerNumber ?? null,
        packtUsername: patch.packtUsername ?? null,
      })
      .where(and(eq(userCompanions.id, id), eq(userCompanions.userId, session.id!)))
      .returning({ id: userCompanions.id });
  } catch {
    return { error: "Something went wrong." };
  }
  if (updated.length === 0) return { error: "Companion not found." };
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
