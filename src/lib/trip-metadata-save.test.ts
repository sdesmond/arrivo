import { expect, it, vi } from "vitest";
vi.mock("@/lib/api/client", () => ({ api: vi.fn() }));
import { hasTripDateChanges } from "./trip-metadata-save";

it("compares supplied dates against the original including null dates", () => {
  const trip = { startDate: "2026-01-01", endDate: "2026-01-02" };
  expect(hasTripDateChanges(trip, { startDate: "2026-01-01", endDate: "2026-01-02" })).toBe(false);
  expect(hasTripDateChanges(trip, { startDate: null })).toBe(true);
  expect(hasTripDateChanges({}, { startDate: null, endDate: null })).toBe(false);
  expect(hasTripDateChanges(trip, { name: "Changed" })).toBe(false);
});

it("dispatches unchanged dates to the API and changed dates together to the legacy action", async () => {
  const { saveTripMetadata } = await import("./trip-metadata-save");
  const { api } = await import("@/lib/api/client");
  const trip = { id: "trip", name: "Old", status: "upcoming" as const, startDate: "2026-01-01", endDate: "2026-01-02" };
  const legacy = vi.fn().mockResolvedValue({ status: "saved" });
  vi.mocked(api).mockResolvedValue({} as never);
  await saveTripMetadata(
    trip,
    { name: "New", startDate: trip.startDate, endDate: trip.endDate },
    legacy,
    undefined,
    undefined,
    true
  );
  expect(api).toHaveBeenCalledWith(expect.anything(), {
    params: { tripId: "trip" },
    body: { name: "New", convertCurrency: true },
  });
  const patch = { name: "New", endDate: "2026-01-03" };
  await saveTripMetadata(trip, patch, legacy);
  expect(legacy).toHaveBeenCalledWith("trip", patch, undefined, undefined);
});
