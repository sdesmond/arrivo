// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  values: vi.fn(),
  merge: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/db", () => ({ db: { insert: vi.fn(() => ({ values: mocks.values })) } }));
vi.mock("./activity-batches", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./activity-batches")>()),
  mergeActivityInterval: mocks.merge,
}));

import { ActivityEventType } from "@/data/types";
import { ACTIVITY_WRITE_TIMEOUT_MS, recordActivity, setActivityClock } from "./activity";

const INPUT = { type: ActivityEventType.SignIn, actor: { id: "user-1", username: "alice" } };
const FIXED = new Date("2026-10-25T12:00:00.000Z");

async function runScheduled() {
  const callback = mocks.after.mock.calls[0][0] as () => Promise<void>;
  await callback();
}

describe("recordActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.after.mockImplementation(() => undefined);
    mocks.values.mockResolvedValue(undefined);
    mocks.merge.mockResolvedValue(undefined);
    setActivityClock(() => FIXED);
  });
  afterEach(() => {
    setActivityClock();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("schedules the write after the response without writing synchronously", () => {
    expect(recordActivity(INPUT)).toBeUndefined();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("inserts the actor id, username snapshot and the clock's time", async () => {
    recordActivity(INPUT);
    await runScheduled();
    expect(mocks.values).toHaveBeenCalledWith({
      type: "sign_in",
      startedAt: FIXED,
      endedAt: FIXED,
      actorId: "user-1",
      actorUsername: "alice",
      targetId: null,
      targetUsername: null,
      tripId: null,
    });
  });

  it("records optional target and trip", async () => {
    recordActivity({ ...INPUT, target: { id: "user-2", username: "bob" }, tripId: "trip-1" });
    await runScheduled();
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: "user-2", targetUsername: "bob", tripId: "trip-1" })
    );
  });

  it("persists a failed sign-in with null actor columns and a known target", async () => {
    recordActivity({ type: ActivityEventType.SignInFailed, actor: null, target: { id: "user-2", username: "bob" } });
    await runScheduled();
    expect(mocks.values).toHaveBeenCalledWith({
      type: "sign_in_failed",
      startedAt: FIXED,
      endedAt: FIXED,
      actorId: null,
      actorUsername: null,
      targetId: "user-2",
      targetUsername: "bob",
      tripId: null,
    });
  });

  it("persists an unknown-account target with a null ID and an unavailable one with neither", async () => {
    recordActivity({ type: ActivityEventType.SignInFailed, actor: null, target: { id: null, username: "ghost" } });
    recordActivity({ type: ActivityEventType.SignInFailed, actor: null });
    for (const [callback] of mocks.after.mock.calls) await (callback as () => Promise<void>)();
    expect(mocks.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ targetId: null, targetUsername: "ghost" })
    );
    expect(mocks.values).toHaveBeenNthCalledWith(2, expect.objectContaining({ targetId: null, targetUsername: null }));
  });

  it("does not batch an actorless event even of a batched type", async () => {
    recordActivity({ type: ActivityEventType.TripUpdated, actor: null, tripId: "trip-1" });
    await runScheduled();
    expect(mocks.merge).not.toHaveBeenCalled();
    expect(mocks.values).toHaveBeenCalledTimes(1);
  });

  it("keeps account events as individual rows rather than batching them", async () => {
    recordActivity({ type: ActivityEventType.PasswordChanged, actor: INPUT.actor });
    await runScheduled();
    expect(mocks.merge).not.toHaveBeenCalled();
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ type: "password_changed", actorId: "user-1" }));
  });

  it.each(["invitation_created", "invitation_accepted", "invitation_rescinded"] as const)(
    "persists two %s transitions as distinct private rows even at the same time",
    async (type) => {
      const input = { type, actor: INPUT.actor, tripId: "trip-1" };
      recordActivity(input);
      recordActivity(input);
      for (const [callback] of mocks.after.mock.calls) await (callback as () => Promise<void>)();
      expect(mocks.merge).not.toHaveBeenCalled();
      expect(mocks.values).toHaveBeenCalledTimes(2);
      for (const [row] of mocks.values.mock.calls)
        expect(row).toEqual({
          type,
          startedAt: FIXED,
          endedAt: FIXED,
          actorId: "user-1",
          actorUsername: "alice",
          targetId: null,
          targetUsername: null,
          tripId: "trip-1",
        });
    }
  );

  it("uses the real clock by default", async () => {
    setActivityClock();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    recordActivity(INPUT);
    await runScheduled();
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ endedAt: new Date("2030-01-01T00:00:00.000Z") })
    );
  });

  it("swallows a scheduling failure and logs without secrets", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.after.mockImplementation(() => {
      throw new Error("outside request scope SECRET-MARKER");
    });
    expect(() => recordActivity(INPUT)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET-MARKER");
  });

  it("swallows an insert rejection and logs without secrets", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.values.mockRejectedValue(new Error("duplicate key value (alice) SECRET-MARKER"));
    recordActivity(INPUT);
    await expect(runScheduled()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET-MARKER");
  });

  it("gives up on a hung insert after the timeout, without retrying", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.values.mockReturnValue(new Promise(() => undefined));
    recordActivity(INPUT);
    const pending = runScheduled();
    await vi.advanceTimersByTimeAsync(ACTIVITY_WRITE_TIMEOUT_MS + 1);
    await expect(pending).resolves.toBeUndefined();
    expect(mocks.values).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("logs a non-Error rejection generically", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.values.mockRejectedValue("boom");
    recordActivity(INPUT);
    await runScheduled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("routes batched types through the interval merge instead of a plain insert", async () => {
    const input = { type: ActivityEventType.TripUpdated, actor: INPUT.actor, tripId: "trip-1" };
    recordActivity(input);
    await runScheduled();
    expect(mocks.merge).toHaveBeenCalledWith(expect.anything(), input, FIXED);
    expect(mocks.values).not.toHaveBeenCalled();
  });

  it("swallows a merge failure and logs without secrets", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.merge.mockRejectedValue(new Error("deadlock detected SECRET-MARKER"));
    recordActivity({ type: ActivityEventType.TripUpdated, actor: INPUT.actor, tripId: "trip-1" });
    await expect(runScheduled()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET-MARKER");
  });
});
