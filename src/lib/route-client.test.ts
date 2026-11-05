import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TripEvent } from "@/data/types";
import { getDayRouteSummary, getDayScheduleConflicts, getRouteDistanceTime } from "./route-client";

const fetchMock = vi.fn();
const events = [{ id: "event-1", name: "Museum", position: 0, locationLat: 48.85, locationLng: 2.35 }] as TripEvent[];

function respond(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  fetchMock.mockResolvedValue({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body });
}

describe("route-client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts a distance request to the trip's routing endpoint and returns the result", async () => {
    respond({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
    const origin = { lat: 1, lng: 2 };
    const destination = { lat: 3, lng: 4 };

    await expect(getRouteDistanceTime("trip-1", origin, destination, "walk")).resolves.toEqual({
      status: "ready",
      distanceMeters: 500,
      durationSeconds: 300,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/trips/trip-1/routing/distance");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ origin, destination, transitMode: "walk" });
  });

  it("posts a day summary request with the walk threshold", async () => {
    respond({ status: "unavailable" });
    await expect(getDayRouteSummary("trip-1", events, "drive", 400)).resolves.toEqual({ status: "unavailable" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/trips/trip-1/routing/day-summary");
    expect(JSON.parse(init.body)).toEqual({ events, transitMode: "drive", walkThresholdMeters: 400 });
  });

  it("posts a conflicts request and sends a missing threshold as null", async () => {
    respond([]);
    await expect(getDayScheduleConflicts("trip-1", events, "drive", undefined)).resolves.toEqual([]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/trips/trip-1/routing/conflicts");
    expect(JSON.parse(init.body).walkThresholdMeters).toBeNull();
  });

  it("encodes the trip id in the path", async () => {
    respond([]);
    await getDayScheduleConflicts("a/b", events, "drive", null);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/trips/a%2Fb/routing/conflicts");
  });

  it("rejects on a non-2xx response so callers fall back to their unavailable state", async () => {
    respond({}, { ok: false, status: 404 });
    await expect(getDayScheduleConflicts("trip-1", events, "drive", null)).rejects.toThrow(
      "Routing request failed (404)"
    );
  });
});
