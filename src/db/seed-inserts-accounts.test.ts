// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { instanceState } from "./schema";
import { markInstanceInitialized, type SeedDb } from "./seed-inserts-accounts";

function fakeDb() {
  const onConflictDoUpdate = vi.fn(async () => undefined);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return { database: { insert } as unknown as SeedDb, insert, values, onConflictDoUpdate };
}

describe("markInstanceInitialized", () => {
  it("upserts the instance_state singleton so public sign-up closes", async () => {
    const { database, insert, values, onConflictDoUpdate } = fakeDb();
    const now = new Date("2026-01-01T00:00:00Z");

    await markInstanceInitialized(database, now);

    expect(insert).toHaveBeenCalledWith(instanceState);
    expect(values).toHaveBeenCalledWith({ id: true, initializedAt: now });
    // An already-initialized instance keeps its original timestamp (coalesce), a fresh one gets `now`.
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ target: instanceState.id, set: { initializedAt: expect.anything() } })
    );
  });
});
