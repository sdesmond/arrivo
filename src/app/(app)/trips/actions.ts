"use server";

import { requireUser } from "@/lib/auth-helpers";
import { assertTripAccess } from "@/lib/auth-helpers";
import { db } from "@/db";
import { trips, collaborators, packingItems } from "@/db/schema";
import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type {
  CreateTripInput, UpdateTripPatch,
  AddCollaboratorInput, AddPackingItemInput,
} from "@/data/types";

export async function createTrip(input: CreateTripInput) {
  const user = await requireUser();
  const [trip] = await db
    .insert(trips)
    .values({
      ownerId: user.id!,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      coverImageUrl: input.coverImageUrl,
      notes: input.notes,
      budgetCurrency: input.budgetCurrency,
      budgetTotal: input.budgetTotal?.toString(),
      budgetPerPerson: input.budgetPerPerson?.toString(),
      tags: input.tags ?? [],
    })
    .returning();
  await db.insert(collaborators).values({
    tripId: trip.id,
    userId: user.id!,
    email: user.email!,
    name: user.name ?? user.email!,
    initials: (user.name ?? user.email!).slice(0, 2).toUpperCase(),
    role: "owner",
  });
  revalidatePath("/trips");
  return trip;
}

export async function updateTripMetadata(tripId: string, patch: UpdateTripPatch) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  await db.update(trips).set({
    ...patch,
    budgetTotal: patch.budgetTotal?.toString(),
    budgetPerPerson: patch.budgetPerPerson?.toString(),
    updatedAt: new Date(),
  }).where(eq(trips.id, tripId));
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
}

export async function deleteTrip(tripId: string) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "owner");
  await db.delete(trips).where(eq(trips.id, tripId));
  revalidatePath("/trips");
}

export async function addCollaborator(tripId: string, input: AddCollaboratorInput) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "owner");
  await db.insert(collaborators).values({
    tripId,
    email: input.email,
    name: input.name,
    initials: input.initials,
    role: input.role,
    tintBg: input.tintBg,
    tintFg: input.tintFg,
  }).onConflictDoNothing();
  revalidatePath(`/trips/${tripId}`);
}

export async function removeCollaborator(collabId: string) {
  const user = await requireUser();
  const [collab] = await db.select().from(collaborators).where(eq(collaborators.id, collabId));
  if (!collab) return;
  await assertTripAccess(collab.tripId, user.id!, "owner");
  await db.delete(collaborators).where(eq(collaborators.id, collabId));
  revalidatePath(`/trips/${collab.tripId}`);
}

export async function updateCollaboratorRole(collabId: string, role: "editor" | "viewer") {
  const user = await requireUser();
  const [collab] = await db.select().from(collaborators).where(eq(collaborators.id, collabId));
  if (!collab) return;
  await assertTripAccess(collab.tripId, user.id!, "owner");
  await db.update(collaborators).set({ role }).where(eq(collaborators.id, collabId));
  revalidatePath(`/trips/${collab.tripId}`);
}

export async function addPackingItem(tripId: string, input: AddPackingItemInput) {
  const user = await requireUser();
  await assertTripAccess(tripId, user.id!, "editor");
  const [{ maxPos }] = await db
    .select({ maxPos: max(packingItems.position) })
    .from(packingItems)
    .where(eq(packingItems.tripId, tripId));
  await db.insert(packingItems).values({
    tripId,
    name: input.name,
    done: false,
    position: (maxPos ?? -1) + 1,
  });
  revalidatePath(`/trips/${tripId}`);
}

export async function togglePackingItem(itemId: string) {
  const user = await requireUser();
  const [item] = await db.select().from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) return;
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.update(packingItems).set({ done: !item.done }).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
}

export async function removePackingItem(itemId: string) {
  const user = await requireUser();
  const [item] = await db.select().from(packingItems).where(eq(packingItems.id, itemId));
  if (!item) return;
  await assertTripAccess(item.tripId, user.id!, "editor");
  await db.delete(packingItems).where(eq(packingItems.id, itemId));
  revalidatePath(`/trips/${item.tripId}`);
}
