"use server";

import { requireAdmin } from "@/lib/auth-helpers";
import {
  readVersion,
  readDatabaseHealth,
  readStorageHealth,
  readUploadStorageBytes,
  readUserCounts,
  readTripCount,
  readDocumentCount,
  readFailedSignIns,
  readRecentAdminActions,
} from "@/lib/overview-readers";

export async function refreshVersion() {
  await requireAdmin();
  return readVersion();
}
export async function refreshDatabase() {
  await requireAdmin();
  return readDatabaseHealth();
}
export async function refreshStorage() {
  await requireAdmin();
  return readStorageHealth();
}
export async function refreshUploadBytes() {
  await requireAdmin();
  return readUploadStorageBytes();
}
export async function refreshUsers() {
  await requireAdmin();
  return (await readUserCounts()).users;
}
export async function refreshAdmins() {
  await requireAdmin();
  return (await readUserCounts()).admins;
}
export async function refreshPending() {
  await requireAdmin();
  return (await readUserCounts()).pending;
}
export async function refreshTrips() {
  await requireAdmin();
  return readTripCount();
}
export async function refreshDocuments() {
  await requireAdmin();
  return readDocumentCount();
}
export async function refreshFailedSignIns() {
  await requireAdmin();
  return readFailedSignIns();
}
export async function refreshAdminActions() {
  await requireAdmin();
  return readRecentAdminActions();
}
