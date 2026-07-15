// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect, mockInsert, mockFrom, mockWhere, mockLimit, mockValues, mockOnConflictDoUpdate, schemaTokens } =
  vi.hoisted(() => {
    const mockSelect = vi.fn();
    const mockInsert = vi.fn();
    const mockFrom = vi.fn();
    const mockWhere = vi.fn();
    const mockLimit = vi.fn();
    const mockValues = vi.fn();
    const mockOnConflictDoUpdate = vi.fn();
    const schemaTokens: Record<string, unknown> = {
      routeCache: {
        originLat: "originLat",
        originLng: "originLng",
        destLat: "destLat",
        destLng: "destLng",
        transitMode: "transitMode",
      },
    };

    return {
      mockSelect,
      mockInsert,
      mockFrom,
      mockWhere,
      mockLimit,
      mockValues,
      mockOnConflictDoUpdate,
      schemaTokens,
    };
  });

vi.mock("@/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock("@/db/schema", () => schemaTokens);

import { getDayRouteSummary, resolveEffectiveMode, getRouteDistanceTime } from "./route";

describe("resolveEffectiveMode", () => {
  it("walks when a hop is below the configured threshold", () => {
    expect(resolveEffectiveMode(399, "drive", 400)).toBe("walk");
  });

  it("uses the trip mode when a hop is above the threshold", () => {
    expect(resolveEffectiveMode(401, "transit", 400)).toBe("transit");
  });

  it("uses the trip mode when no threshold is configured", () => {
    expect(resolveEffectiveMode(100, "drive", null)).toBe("drive");
    expect(resolveEffectiveMode(100, "transit", undefined)).toBe("transit");
  });

  it("walks no hops when threshold is zero", () => {
    expect(resolveEffectiveMode(0, "drive", 0)).toBe("drive");
  });

  it("uses the trip mode when a hop equals the threshold", () => {
    expect(resolveEffectiveMode(400, "transit", 400)).toBe("transit");
  });
});

describe("getRouteDistanceTime", () => {
  const origin = { lat: 48.8566, lng: 2.3522 };
  const destination = { lat: 48.8584, lng: 2.2945 };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MAPBOX_ACCESS_TOKEN = "test-token";

    mockLimit.mockResolvedValue([]);
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    mockOnConflictDoUpdate.mockResolvedValue(undefined);
    mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate });
    mockInsert.mockReturnValue({ values: mockValues });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ routes: [{ distance: 1234.6, duration: 567.4 }] }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });

  it("returns a cached result without calling the API on a cache hit", async () => {
    mockLimit.mockResolvedValue([{ distanceMeters: 500, durationSeconds: 300, fetchedAt: new Date() }]);

    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(result).toEqual({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns unavailable when the cache lookup fails", async () => {
    mockLimit.mockRejectedValue(new Error("database unavailable"));

    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(result).toEqual({ status: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls the API and stores the result on a cache miss", async () => {
    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(fetch).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ distanceMeters: 1235, durationSeconds: 567 }));
    expect(result).toEqual({ status: "ready", distanceMeters: 1235, durationSeconds: 567 });
  });

  it("triggers a fresh API call when the cached entry is older than 24 hours", async () => {
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockLimit.mockResolvedValue([{ distanceMeters: 999, durationSeconds: 999, fetchedAt: staleDate }]);

    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: "ready", distanceMeters: 1235, durationSeconds: 567 });
  });

  it("returns unavailable when the API call times out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError")));

    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(result).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when the API call errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(result).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));

    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(result).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when no Mapbox token is configured", async () => {
    delete process.env.MAPBOX_ACCESS_TOKEN;

    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(result).toEqual({ status: "unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns unavailable when the response has no routes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ routes: [] }) }));

    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(result).toEqual({ status: "unavailable" });
  });

  it("maps walk mode to the walking profile", async () => {
    await getRouteDistanceTime(origin, destination, "walk");

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/directions/v5/mapbox/walking/");
  });

  it("maps drive mode to the driving profile", async () => {
    await getRouteDistanceTime(origin, destination, "drive");

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/directions/v5/mapbox/driving/");
  });

  it("maps transit mode to the mapbox/transit profile", async () => {
    await getRouteDistanceTime(origin, destination, "transit");

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/directions/v5/mapbox/mapbox/transit/");
  });

  it("rounds distance and duration to integers", async () => {
    const result = await getRouteDistanceTime(origin, destination, "walk");

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(Number.isInteger(result.distanceMeters)).toBe(true);
      expect(Number.isInteger(result.durationSeconds)).toBe(true);
    }
  });
});

describe("getDayRouteSummary", () => {
  it("returns unavailable without two located items", async () => {
    await expect(getDayRouteSummary([{ id: "one", name: "One", position: 0 }], "drive", null)).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("aggregates available hops in position order and skips unavailable hops", async () => {
    mockLimit
      .mockResolvedValueOnce([{ distanceMeters: 500, durationSeconds: 120, fetchedAt: new Date() }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ distanceMeters: 700, durationSeconds: 300, fetchedAt: new Date() }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));

    const result = await getDayRouteSummary(
      [
        { id: "third", name: "Third", position: 2, locationLat: 48.86, locationLng: 2.36 },
        { id: "first", name: "First", position: 0, locationLat: 48.85, locationLng: 2.35 },
        { id: "freeform", name: "Freeform", position: 1 },
        { id: "second", name: "Second", position: 1, locationLat: 48.855, locationLng: 2.355 },
        { id: "fourth", name: "Fourth", position: 3, locationLat: 48.865, locationLng: 2.365 },
      ],
      "drive",
      null
    );

    expect(result).toEqual({ status: "ready", totalDistanceMeters: 1200, totalDurationSeconds: 420, hopCount: 2 });
  });
});
