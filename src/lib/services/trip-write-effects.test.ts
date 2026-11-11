import { expect, it, vi } from "vitest";
const { recordTripUpdated, publishTripEvent, revalidatePath } = vi.hoisted(() => ({
  recordTripUpdated: vi.fn(),
  publishTripEvent: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));
vi.mock("@/lib/trip-events", () => ({ publishTripEvent }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { LiveSyncEventType } from "@/data/types";
import { afterTripWrite } from "./trip-write-effects";
it("preserves activity, live sync, and page invalidation", () => {
  afterTripWrite({ userId: "user" }, "trip");
  expect(recordTripUpdated).toHaveBeenCalledWith("user", "trip");
  expect(publishTripEvent).toHaveBeenCalledWith("trip", { type: LiveSyncEventType.ItineraryChanged, tripId: "trip" });
  expect(revalidatePath).toHaveBeenCalledWith("/trips/trip");
});
it("also revalidates any extra paths, once each", () => {
  revalidatePath.mockClear();
  afterTripWrite({ userId: "user" }, "trip", ["/trips"]);
  expect(revalidatePath.mock.calls).toEqual([["/trips/trip"], ["/trips"]]);
});
