import { getOfflineDbForSession, type OfflineDb } from "./db";

export async function writeOfflineAware<T>(
  isOnline: boolean,
  database: OfflineDb | null | undefined,
  offlineWrite: (database: OfflineDb) => Promise<T>,
  onlineWrite: () => Promise<T>
): Promise<T> {
  if (!isOnline) {
    const offlineDatabase = database ?? (await getOfflineDbForSession());
    if (!offlineDatabase) {
      throw new Error("OFFLINE_DB_UNAVAILABLE");
    }
    return offlineWrite(offlineDatabase);
  }
  return onlineWrite();
}
