import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
}));
import { api, ApiClientError } from "@/lib/api/client";
import { TripDateConflictResolution } from "@/data/types";
import { hasTripDateChanges, saveTripMetadata } from "./trip-metadata-save";

const trip = { id: "trip", name: "Old", status: "upcoming" as const, startDate: "2026-01-01", endDate: "2026-01-02" };
const confirmation = {
  removedDates: ["2026-01-02"],
  events: [],
  noteCount: 1,
  checklistCount: 0,
  eventDocumentCount: 0,
};

beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({} as never);
});

it("compares supplied dates against the original including null dates", () => {
  const dates = { startDate: "2026-01-01", endDate: "2026-01-02" };
  expect(hasTripDateChanges(dates, { startDate: "2026-01-01", endDate: "2026-01-02" })).toBe(false);
  expect(hasTripDateChanges(dates, { startDate: null })).toBe(true);
  expect(hasTripDateChanges({}, { startDate: null, endDate: null })).toBe(false);
  expect(hasTripDateChanges(dates, { name: "Changed" })).toBe(false);
});

it("drops unchanged dates and the cover, and sends the currency conversion flag", async () => {
  await expect(
    saveTripMetadata(
      trip,
      { name: "New", startDate: trip.startDate, endDate: trip.endDate, coverImageUrl: "x" },
      undefined,
      undefined,
      true
    )
  ).resolves.toEqual({ status: "saved" });
  expect(api).toHaveBeenCalledWith(expect.anything(), {
    params: { tripId: "trip" },
    body: { name: "New", convertCurrency: true },
  });
});

it("sends changed dates in the same request as the metadata", async () => {
  await saveTripMetadata(trip, { name: "New", endDate: "2026-01-03" });
  expect(api).toHaveBeenCalledWith(expect.anything(), {
    params: { tripId: "trip" },
    body: { name: "New", startDate: undefined, endDate: "2026-01-03" },
  });
});

it("echoes the resolution with its confirmation", async () => {
  await saveTripMetadata(trip, { endDate: "2026-01-01" }, TripDateConflictResolution.DeleteEvents, confirmation);
  expect(api).toHaveBeenCalledWith(expect.anything(), {
    params: { tripId: "trip" },
    body: { startDate: undefined, endDate: "2026-01-01", resolution: "delete-events", confirmation },
  });
});

it("turns a confirmation_required failure into a confirmation-required result", async () => {
  vi.mocked(api).mockRejectedValueOnce(
    new ApiClientError(409, "confirmation_required", "Confirm.", undefined, undefined, confirmation)
  );
  await expect(saveTripMetadata(trip, { endDate: "2026-01-01" })).resolves.toEqual({
    status: "confirmation-required",
    confirmation,
  });
});

it("rethrows every other failure, including a stale confirmation", async () => {
  const stale = new ApiClientError(409, "conflict", "Trip dates changed.");
  vi.mocked(api).mockRejectedValueOnce(stale);
  await expect(saveTripMetadata(trip, { endDate: "2026-01-01" })).rejects.toBe(stale);
  const plain = new Error("boom");
  vi.mocked(api).mockRejectedValueOnce(plain);
  await expect(saveTripMetadata(trip, { name: "New" })).rejects.toBe(plain);
});
