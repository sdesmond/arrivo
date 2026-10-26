// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { select, recordActivity, after } = vi.hoisted(() => ({
  select: vi.fn(),
  recordActivity: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select } }));
vi.mock("@/lib/activity", () => ({ recordActivity }));
vi.mock("next/server", () => ({ after }));
import {
  recordTripCreated,
  recordTripUpdated,
  recordTripInvitation,
  TRIP_ACTIVITY_LOOKUP_TIMEOUT_MS,
} from "./trip-activity";

async function runScheduled(): Promise<void> {
  const callback = after.mock.calls[0][0] as () => Promise<void>;
  await callback();
}

describe.each(["trip_updated", "invitation_created", "invitation_accepted", "invitation_rescinded"] as const)(
  "trip activity %s",
  (type) => {
    const record = (userId: string, tripId: string) =>
      type === "trip_updated" ? recordTripUpdated(userId, tripId) : recordTripInvitation(type, userId, tripId);
    beforeEach(() => {
      vi.resetAllMocks();
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("records creation using the committed identity without a lookup", () => {
      recordTripCreated({ id: "actor", username: "alice" }, "trip");
      expect(select).not.toHaveBeenCalled();
      expect(recordActivity).toHaveBeenCalledExactlyOnceWith({
        type: "trip_created",
        actor: { id: "actor", username: "alice" },
        tripId: "trip",
      });
    });
    it("returns synchronously and defers lookup until after the response", () => {
      expect(record("actor", "trip")).toBeUndefined();
      expect(after).toHaveBeenCalledOnce();
      expect(select).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    });
    it("looks up event-time username and records only actor and trip ID", async () => {
      select.mockReturnValue({ from: () => ({ where: async () => [{ username: "alice" }] }) });
      record("actor", "trip");
      await runScheduled();
      expect(recordActivity).toHaveBeenCalledExactlyOnceWith({
        type,
        actor: { id: "actor", username: "alice" },
        tripId: "trip",
      });
      expect(vi.getTimerCount()).toBe(0);
    });
    it("skips missing identities", async () => {
      select.mockReturnValue({ from: () => ({ where: async () => [] }) });
      record("actor", "trip");
      await expect(runScheduled()).resolves.toBeUndefined();
      expect(recordActivity).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
    it("isolates rejected lookups", async () => {
      select.mockReturnValue({
        from: () => ({
          where: async () => {
            throw new Error("lookup");
          },
        }),
      });
      record("actor", "trip");
      await expect(runScheduled()).resolves.toBeUndefined();
      expect(recordActivity).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
    it("isolates synchronous lookup failures", async () => {
      select.mockImplementation(() => {
        throw new Error("lookup");
      });
      record("actor", "trip");
      await expect(runScheduled()).resolves.toBeUndefined();
      expect(recordActivity).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
    it("isolates post-response scheduling failure without querying", () => {
      after.mockImplementation(() => {
        throw new Error("schedule");
      });
      expect(() => record("actor", "trip")).not.toThrow();
      expect(select).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    });
    it("isolates recorder failures for both event types", async () => {
      recordActivity.mockImplementation(() => {
        throw new Error("schedule");
      });
      select.mockReturnValue({ from: () => ({ where: async () => [{ username: "alice" }] }) });
      expect(() => recordTripCreated({ id: "actor", username: "alice" }, "trip")).not.toThrow();
      record("actor", "trip");
      await expect(runScheduled()).resolves.toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    });
    it("bounds a hung lookup to five seconds without retrying or late emission", async () => {
      let resolveLookup!: (rows: { username: string }[]) => void;
      const lookup = new Promise<{ username: string }[]>((resolve) => {
        resolveLookup = resolve;
      });
      select.mockReturnValue({ from: () => ({ where: () => lookup }) });
      expect(record("actor", "trip")).toBeUndefined();
      const scheduled = runScheduled();
      expect(TRIP_ACTIVITY_LOOKUP_TIMEOUT_MS).toBe(5_000);
      await vi.advanceTimersByTimeAsync(TRIP_ACTIVITY_LOOKUP_TIMEOUT_MS);
      await expect(scheduled).resolves.toBeUndefined();
      resolveLookup([{ username: "late" }]);
      await lookup;
      await Promise.resolve();
      expect(select).toHaveBeenCalledOnce();
      expect(recordActivity).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
    it("handles a late lookup rejection after timeout without emitting", async () => {
      let rejectLookup!: (error: Error) => void;
      const lookup = new Promise<never>((_resolve, reject) => {
        rejectLookup = reject;
      });
      select.mockReturnValue({ from: () => ({ where: () => lookup }) });
      record("actor", "trip");
      const scheduled = runScheduled();
      await vi.advanceTimersByTimeAsync(TRIP_ACTIVITY_LOOKUP_TIMEOUT_MS);
      await scheduled;
      rejectLookup(new Error("late"));
      await vi.runAllTimersAsync();
      expect(recordActivity).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  }
);
