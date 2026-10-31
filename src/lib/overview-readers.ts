import "server-only";
import { sql } from "drizzle-orm";
import { db as appDb } from "@/db";
import { documents, trips, users } from "@/db/schema";
import { UserRole } from "@/data/types";
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

export interface OverviewDb {
  ping: () => Promise<unknown>;
  countUsers: () => Promise<UserCounts>;
  countTrips: () => Promise<number>;
  countDocuments: () => Promise<number>;
}

export const defaultOverviewDb: OverviewDb = {
  ping: () => appDb.execute(sql`select 1`),
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
  // One shared query; wrap each pick so a rejection marks all three unavailable without throwing.
  const counts = measureMetric(() => db.countUsers(), checkedAt);
  const pick = async (key: keyof UserCounts): Promise<Metric<number>> => {
    const result = await counts;
    return result.status === "ok"
      ? { status: "ok", value: result.value[key], checkedAt: result.checkedAt }
      : { status: "unavailable", checkedAt: result.checkedAt };
  };
  const [usersMetric, admins, pending] = await Promise.all([pick("users"), pick("admins"), pick("pending")]);
  return { users: usersMetric, admins, pending };
}
