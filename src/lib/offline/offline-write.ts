import type { OfflineDb } from "./db";

export async function writeOfflineAware<T>(
  isOnline: boolean,
  database: OfflineDb | null | undefined,
  offlineWrite: (database: OfflineDb) => Promise<T>,
  onlineWrite: () => Promise<T>
): Promise<T> {
  if (!isOnline && database) {
    return offlineWrite(database);
  }
  return onlineWrite();
}
