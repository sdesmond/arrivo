import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import type { LiveSyncEvent } from "@/data/types";
import {
  clearRevocationTicket,
  getRevocationTicket,
  getServerRevocationTicket,
  publishRevocationTicket,
  subscribeRevocation,
} from "./revocation-ticket";

const SAMPLE_EVENT: LiveSyncEvent = {
  type: LiveSyncEventType.MembershipRemoved,
  removedUserId: "user-1",
  tripId: "trip-1",
  tripName: "Test Trip",
  removedByName: "Manager",
  removedByEmail: "manager@example.com",
};

describe("revocation-ticket", () => {
  beforeEach(() => {
    clearRevocationTicket();
  });

  it("starts with no ticket", () => {
    expect(getRevocationTicket()).toBeNull();
  });

  it("has no ticket on the server", () => {
    expect(getServerRevocationTicket()).toBeNull();
  });

  it("publishes a ticket and notifies subscribers", () => {
    const listener = vi.fn();
    subscribeRevocation(listener);

    publishRevocationTicket(SAMPLE_EVENT);

    expect(getRevocationTicket()).toEqual(SAMPLE_EVENT);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("clears a published ticket and notifies subscribers", () => {
    publishRevocationTicket(SAMPLE_EVENT);
    const listener = vi.fn();
    subscribeRevocation(listener);

    clearRevocationTicket();

    expect(getRevocationTicket()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not notify subscribers when clearing an already-empty ticket", () => {
    const listener = vi.fn();
    subscribeRevocation(listener);

    clearRevocationTicket();

    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying a subscriber once it unsubscribes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRevocation(listener);
    unsubscribe();

    publishRevocationTicket(SAMPLE_EVENT);

    expect(listener).not.toHaveBeenCalled();
  });

  it("returns a stable snapshot reference across repeated reads with no change", () => {
    publishRevocationTicket(SAMPLE_EVENT);

    expect(getRevocationTicket()).toBe(getRevocationTicket());
  });

  it("notifies every subscriber, not just the first", () => {
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    subscribeRevocation(firstListener);
    subscribeRevocation(secondListener);

    publishRevocationTicket(SAMPLE_EVENT);

    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).toHaveBeenCalledOnce();
  });
});
