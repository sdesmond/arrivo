// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityEventType, LiveSyncEventType } from "@/data/types";
import type { ActivityEventInput, DeletedAccountSummary } from "@/data/types";

const {
  mockRecordActivity,
  mockStorageDel,
  mockPublishTripEvent,
  mockPublishUserEvent,
  mockPurgeTripTopic,
  mockInvite,
} = vi.hoisted(() => ({
  mockRecordActivity: vi.fn(),
  mockStorageDel: vi.fn(),
  mockPublishTripEvent: vi.fn(),
  mockPublishUserEvent: vi.fn(),
  mockPurgeTripTopic: vi.fn(),
  mockInvite: vi.fn(),
}));

vi.mock("@/lib/activity", () => ({ recordActivity: mockRecordActivity }));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ del: mockStorageDel }) }));
vi.mock("@/lib/trip-events", () => ({
  publishTripEvent: mockPublishTripEvent,
  publishUserEvent: mockPublishUserEvent,
  purgeTripTopic: mockPurgeTripTopic,
}));
vi.mock("@/lib/invitations", () => ({ publishInvitationChanged: mockInvite }));

import { runAccountDeletionEffects } from "./account-deletion-effects";

const SUMMARY: DeletedAccountSummary = {
  rescindedInvitations: [{ inviteeId: "user-grace", tripId: "trip-shared" }],
  transferredTrips: [["trip-transferred", "user-ada"]],
  deletedTripIds: ["trip-solo"],
  deletedTripMembers: [{ tripId: "trip-solo", userId: "user-bo" }],
  remainingTripIds: ["trip-transferred", "trip-transferred"],
  storageUrls: ["/api/storage/docs/ticket.pdf", "/api/storage/covers/porto.jpg"],
  account: { id: "user-1", username: "alice" },
};
const EVENT: ActivityEventInput = { type: ActivityEventType.AccountDeleted, actor: SUMMARY.account };

describe("runAccountDeletionEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorageDel.mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("records the event before notifying and cleaning up", async () => {
    await runAccountDeletionEffects(SUMMARY, EVENT);

    expect(mockRecordActivity).toHaveBeenCalledWith(EVENT);
    expect(mockRecordActivity.mock.invocationCallOrder[0]).toBeLessThan(mockStorageDel.mock.invocationCallOrder[0]);
    expect(mockRecordActivity.mock.invocationCallOrder[0]).toBeLessThan(
      mockPublishTripEvent.mock.invocationCallOrder[0]
    );
  });

  it("publishes each notification once", async () => {
    await runAccountDeletionEffects(SUMMARY, EVENT);

    expect(mockInvite).toHaveBeenCalledWith("user-grace", "trip-shared");
    expect(mockPublishTripEvent).toHaveBeenCalledWith("trip-solo", {
      type: LiveSyncEventType.TripDeleted,
      tripId: "trip-solo",
    });
    expect(mockPublishUserEvent).toHaveBeenCalledWith("user-bo", {
      type: LiveSyncEventType.TripDeleted,
      tripId: "trip-solo",
    });
    expect(mockPurgeTripTopic).toHaveBeenCalledWith("trip-solo");
    expect(
      mockPublishTripEvent.mock.calls.filter(([, event]) => event.type === LiveSyncEventType.MembershipChanged)
    ).toHaveLength(1);
    expect(mockPublishUserEvent).toHaveBeenCalledWith("user-ada", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-transferred",
    });
    expect(mockStorageDel).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["the activity recorder", mockRecordActivity],
    ["an invitation notification", mockInvite],
    ["a trip notification", mockPublishTripEvent],
    ["a member notification", mockPublishUserEvent],
    ["the topic purge", mockPurgeTripTopic],
  ])("attempts every remaining effect when %s throws", async (_label, failing) => {
    failing.mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(runAccountDeletionEffects(SUMMARY, EVENT)).resolves.toBeUndefined();

    expect(mockRecordActivity).toHaveBeenCalled();
    expect(mockInvite).toHaveBeenCalled();
    expect(mockPublishTripEvent).toHaveBeenCalled();
    expect(mockPublishUserEvent).toHaveBeenCalled();
    expect(mockPurgeTripTopic).toHaveBeenCalled();
    expect(mockStorageDel).toHaveBeenCalledTimes(2);
  });

  it("still deletes the other files when one cleanup rejects", async () => {
    mockStorageDel.mockRejectedValueOnce(new Error("disk gone"));

    await expect(runAccountDeletionEffects(SUMMARY, EVENT)).resolves.toBeUndefined();

    expect(mockStorageDel).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalled();
  });

  it("survives the storage adapter failing to initialise", async () => {
    mockStorageDel.mockImplementation(() => {
      throw new Error("no adapter");
    });

    await expect(runAccountDeletionEffects(SUMMARY, EVENT)).resolves.toBeUndefined();
  });
});
