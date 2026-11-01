import "server-only";
import { sql } from "drizzle-orm";
import { db as appDb } from "@/db";
import { documents, trips, users } from "@/db/schema";
import { ActivityEventType, UserRole, type ActivityEventSummary } from "@/data/types";
import { countActivitySince, readRecentActivity } from "@/lib/activity-queries";
import { measureMetric, type Metric } from "@/lib/overview-metric";
import { getStorageAdapter, type StorageAdapter } from "@/lib/storage/storage-adapter";

export function readStorageHealth(storage?: Pick<StorageAdapter, "probe">, now?: Date): Promise<Metric<"Healthy">> {
  return measureMetric(async () => {
    const adapter = storage ?? getStorageAdapter();
    await adapter.probe();
    return "Healthy" as const;
  }, now);
}

export function readUploadStorageBytes(
  storage?: Pick<StorageAdapter, "getUsageBytes">,
  now?: Date
): Promise<Metric<number>> {
  return measureMetric(() => (storage ?? getStorageAdapter()).getUsageBytes(), now);
}

export interface UserCounts {
  users: number;
  admins: number;
  pending: number;
}

/** Activity types that record an admin acting on the instance or another account. */
export const ADMIN_ACTION_TYPES: readonly ActivityEventType[] = [
  ActivityEventType.RetentionChanged,
  ActivityEventType.AccountCreated,
  ActivityEventType.SetupLinkGenerated,
  ActivityEventType.SetupLinkRegenerated,
  ActivityEventType.PendingAccountDeleted,
  ActivityEventType.RoleChanged,
  ActivityEventType.PasswordResetLinkGenerated,
  ActivityEventType.AdminRecoveryLinkGenerated,
  ActivityEventType.AccountDeletedByAdmin,
];
export const RECENT_ADMIN_ACTION_LIMIT = 5;
export const FAILED_SIGN_IN_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface OverviewDb {
  ping: () => Promise<unknown>;
  countUsers: () => Promise<UserCounts>;
  countTrips: () => Promise<number>;
  countDocuments: () => Promise<number>;
  recentAdminActions: () => Promise<ActivityEventSummary[]>;
  countFailedSignIns: (since: Date) => Promise<number>;
}

export const defaultOverviewDb: OverviewDb = {
  ping: () => appDb.execute(sql`select 1`),
  recentAdminActions: () => readRecentActivity(appDb, ADMIN_ACTION_TYPES, RECENT_ADMIN_ACTION_LIMIT),
  countFailedSignIns: (since) => countActivitySince(appDb, ActivityEventType.SignInFailed, since),
  countTrips: async () => {
    const [row] = await appDb.select({ total: sql<number>`count(*)::int` }).from(trips);
    return row.total;
  },
  countDocuments: async () => {
    const [row] = await appDb.select({ total: sql<number>`count(*)::int` }).from(documents);
    return row.total;
  },
  countUsers: async () => {
    // One query so the three counts are consistent. Pending setup = no password yet; admins = completed admins only.
    const [row] = await appDb
      .select({
        total: sql<number>`count(*)::int`,
        admins: sql<number>`count(*) filter (where ${users.role} = ${UserRole.Admin} and ${users.passwordHash} is not null)::int`,
        pending: sql<number>`count(*) filter (where ${users.passwordHash} is null)::int`,
      })
      .from(users);
    return { users: row.total, admins: row.admins, pending: row.pending };
  },
};

export function readTripCount(db: OverviewDb = defaultOverviewDb, now?: Date): Promise<Metric<number>> {
  return measureMetric(() => db.countTrips(), now);
}

export function readDocumentCount(db: OverviewDb = defaultOverviewDb, now?: Date): Promise<Metric<number>> {
  return measureMetric(() => db.countDocuments(), now);
}

export function readRecentAdminActions(
  db: OverviewDb = defaultOverviewDb,
  now?: Date
): Promise<Metric<ActivityEventSummary[]>> {
  return measureMetric(() => db.recentAdminActions(), now);
}

/** Failed sign-ins in the 24 hours up to the check, inclusive; the window uses the real clock, not `getNow()`. */
export function readFailedSignIns(db: OverviewDb = defaultOverviewDb, now?: Date): Promise<Metric<number>> {
  const checkedAt = now ?? new Date();
  return measureMetric(
    () => db.countFailedSignIns(new Date(checkedAt.getTime() - FAILED_SIGN_IN_WINDOW_MS)),
    checkedAt
  );
}

export function readVersion(now?: Date): Promise<Metric<string>> {
  return measureMetric(() => {
    const version = process.env.APP_VERSION;
    if (!version) throw new Error("APP_VERSION is not set");
    return version;
  }, now);
}

export function readDatabaseHealth(db: OverviewDb = defaultOverviewDb, now?: Date): Promise<Metric<"Healthy">> {
  return measureMetric(async () => {
    await db.ping();
    return "Healthy" as const;
  }, now);
}

export async function readUserCounts(
  db: OverviewDb = defaultOverviewDb,
  now?: Date
): Promise<{ users: Metric<number>; admins: Metric<number>; pending: Metric<number> }> {
  const checkedAt = now ?? new Date();
  // Measure once so all three counts share a query outcome and checked time.
  const counts = await measureMetric(() => db.countUsers(), checkedAt);
  const pick = (key: keyof UserCounts): Metric<number> => {
    return counts.status === "ok"
      ? { status: "ok", value: counts.value[key], checkedAt: counts.checkedAt }
      : { status: "unavailable", checkedAt: counts.checkedAt };
  };
  return { users: pick("users"), admins: pick("admins"), pending: pick("pending") };
}
