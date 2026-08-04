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

import {
  getDayRouteSummary,
  getDayScheduleConflicts,
  resolveEffectiveMode,
  getRouteDistanceTime,
  quantizeCoord,
} from "./route";

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

  it("uses the trip mode when the hop distance is NaN", () => {
    expect(resolveEffectiveMode(NaN, "drive", 400)).toBe("drive");
  });

  it("uses the trip mode when the hop distance is negative", () => {
    expect(resolveEffectiveMode(-10, "transit", 400)).toBe("transit");
  });
});

describe("quantizeCoord", () => {
  it("rounds to 6 decimal places", () => {
    expect(quantizeCoord(48.856599999999996)).toBe(48.8566);
  });

  it("leaves already-precise coordinates unchanged", () => {
    expect(quantizeCoord(48.8566)).toBe(48.8566);
  });

  it("collapses epsilon-different coordinates to the same value", () => {
    expect(quantizeCoord(2.352200000000001)).toBe(quantizeCoord(2.3522));
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

  it("quantizes coordinates before writing the cache row so float-epsilon jitter can't create duplicate rows", async () => {
    const jitteredOrigin = { lat: 48.856599999999996, lng: 2.352200000000001 };
    const jitteredDestination = { lat: 48.858399999999996, lng: 2.294500000000001 };

    await getRouteDistanceTime(jitteredOrigin, jitteredDestination, "walk");

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        originLat: 48.8566,
        originLng: 2.3522,
        destLat: 48.8584,
        destLng: 2.2945,
      })
    );
  });

  it("deduplicates concurrent cache-miss lookups for the same hop", async () => {
    const [firstResult, secondResult] = await Promise.all([
      getRouteDistanceTime(origin, destination, "walk"),
      getRouteDistanceTime(origin, destination, "walk"),
    ]);

    expect(fetch).toHaveBeenCalledOnce();
    expect(firstResult).toEqual(secondResult);
  });

  it("deduplicates concurrent requests for epsilon-different coordinates that quantize to the same key", async () => {
    const jitteredOrigin = { lat: 48.856599999999996, lng: 2.352200000000001 };
    const jitteredDestination = { lat: 48.858399999999996, lng: 2.294500000000001 };

    const [firstResult, secondResult] = await Promise.all([
      getRouteDistanceTime(origin, destination, "walk"),
      getRouteDistanceTime(jitteredOrigin, jitteredDestination, "walk"),
    ]);

    expect(fetch).toHaveBeenCalledOnce();
    expect(firstResult).toEqual(secondResult);
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

function stubFetchByProfile(responses: Record<string, { distance: number; duration: number }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const entry = Object.entries(responses).find(([profile]) => url.includes(`/directions/v5/mapbox/${profile}/`));
      if (!entry) return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      const [, { distance, duration }] = entry;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ routes: [{ distance, duration }] }) });
    })
  );
}

const NEAR_ORIGIN = { lat: 48.8566, lng: 2.3522 };
const NEAR_DESTINATION = { lat: 48.8586, lng: 2.3522 }; // ~222m from NEAR_ORIGIN, below a 400m threshold
const FAR_DESTINATION = { lat: 48.8666, lng: 2.3522 }; // ~1112m from NEAR_ORIGIN, at/over a 400m threshold

describe("getDayRouteSummary — two-phase mode resolution", () => {
  const nearEvents = [
    { id: "first", name: "First", position: 0, locationLat: NEAR_ORIGIN.lat, locationLng: NEAR_ORIGIN.lng },
    { id: "second", name: "Second", position: 1, locationLat: NEAR_DESTINATION.lat, locationLng: NEAR_DESTINATION.lng },
  ];
  const farEvents = [
    { id: "first", name: "First", position: 0, locationLat: NEAR_ORIGIN.lat, locationLng: NEAR_ORIGIN.lng },
    { id: "second", name: "Second", position: 1, locationLat: FAR_DESTINATION.lat, locationLng: FAR_DESTINATION.lng },
  ];

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });

  it("refetches with walk when the default-mode route resolves to a different effective mode, and uses the walk route's distance and duration", async () => {
    stubFetchByProfile({
      driving: { distance: 350, duration: 90 },
      walking: { distance: 300, duration: 240 },
    });

    const result = await getDayRouteSummary(nearEvents, "drive", 400);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toContain("/directions/v5/mapbox/driving/");
    expect(calls[1][0]).toContain("/directions/v5/mapbox/walking/");
    expect(result).toEqual({ status: "ready", totalDistanceMeters: 300, totalDurationSeconds: 240, hopCount: 1 });
  });

  it("does not refetch when the default-mode route's distance keeps the trip default mode", async () => {
    stubFetchByProfile({ driving: { distance: 450, duration: 120 } });

    const result = await getDayRouteSummary(nearEvents, "drive", 400);

    expect(fetch).toHaveBeenCalledOnce();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("/directions/v5/mapbox/driving/");
    expect(result).toEqual({ status: "ready", totalDistanceMeters: 450, totalDurationSeconds: 120, hopCount: 1 });
  });

  it("skips mode evaluation when straight-line distance is at or over the threshold, even if the route would appear walkable", async () => {
    stubFetchByProfile({ driving: { distance: 50, duration: 30 } });

    const result = await getDayRouteSummary(farEvents, "drive", 400);

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: "ready", totalDistanceMeters: 50, totalDurationSeconds: 30, hopCount: 1 });
  });

  it("never issues a duplicate walk request when the trip default mode is already walk", async () => {
    stubFetchByProfile({ walking: { distance: 150, duration: 200 } });

    const result = await getDayRouteSummary(nearEvents, "walk", 400);

    expect(fetch).toHaveBeenCalledOnce();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("/directions/v5/mapbox/walking/");
    expect(result).toEqual({ status: "ready", totalDistanceMeters: 150, totalDurationSeconds: 200, hopCount: 1 });
  });

  it("skips a hop without a walk refetch when the default-mode route is unavailable", async () => {
    stubFetchByProfile({});

    const result = await getDayRouteSummary(nearEvents, "drive", 400);

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: "unavailable" });
  });

  it("skips a hop when the walk refetch is unavailable instead of falling back to the default-mode route", async () => {
    stubFetchByProfile({ driving: { distance: 350, duration: 90 } });

    const result = await getDayRouteSummary(nearEvents, "drive", 400);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toContain("/directions/v5/mapbox/driving/");
    expect(calls[1][0]).toContain("/directions/v5/mapbox/walking/");
    expect(result).toEqual({ status: "unavailable" });
  });
});

function createDeferredFetch() {
  const resolvers: ((value: { ok: boolean; json: () => Promise<unknown> }) => void)[] = [];
  const fetchMock = vi.fn(
    () =>
      new Promise<{ ok: boolean; json: () => Promise<unknown> }>((resolve) => {
        resolvers.push(resolve);
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, resolvers };
}

async function flushMicrotasks(times = 6) {
  for (let iteration = 0; iteration < times; iteration += 1) {
    await Promise.resolve();
  }
}

function jsonResponse(distance: number, duration: number) {
  return { ok: true, json: () => Promise.resolve({ routes: [{ distance, duration }] }) };
}

const unavailableResponse = { ok: false, json: () => Promise.resolve({}) };

describe("getDayRouteSummary — concurrent hop resolution", () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });

  const threeStopEvents = [
    { id: "a", name: "A", position: 0, locationLat: 48.85, locationLng: 2.35 },
    { id: "b", name: "B", position: 1, locationLat: 48.855, locationLng: 2.355 },
    { id: "c", name: "C", position: 2, locationLat: 48.86, locationLng: 2.36 },
  ];

  it("starts both hops before either settles, and aggregates correctly when they resolve out of order", async () => {
    const { fetchMock, resolvers } = createDeferredFetch();

    const summaryPromise = getDayRouteSummary(threeStopEvents, "drive", null);

    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers[1](jsonResponse(700, 300));
    resolvers[0](jsonResponse(500, 120));

    await expect(summaryPromise).resolves.toEqual({
      status: "ready",
      totalDistanceMeters: 1200,
      totalDurationSeconds: 420,
      hopCount: 2,
    });
  });

  it("isolates an unavailable hop during concurrent settlement without blocking the ready hop", async () => {
    const { fetchMock, resolvers } = createDeferredFetch();

    const summaryPromise = getDayRouteSummary(threeStopEvents, "drive", null);

    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers[0](unavailableResponse);
    resolvers[1](jsonResponse(700, 300));

    await expect(summaryPromise).resolves.toEqual({
      status: "ready",
      totalDistanceMeters: 700,
      totalDurationSeconds: 300,
      hopCount: 1,
    });
  });

  it("returns unavailable when every hop fails during concurrent settlement", async () => {
    const { fetchMock, resolvers } = createDeferredFetch();

    const summaryPromise = getDayRouteSummary(threeStopEvents, "drive", null);

    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers[1](unavailableResponse);
    resolvers[0](unavailableResponse);

    await expect(summaryPromise).resolves.toEqual({ status: "unavailable" });
  });
});

describe("getDayRouteSummary", () => {
  it("returns unavailable without any located items", async () => {
    await expect(getDayRouteSummary([{ id: "one", name: "One", position: 0 }], "drive", null)).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("returns unavailable with exactly one located item", async () => {
    const events = [{ id: "one", name: "One", position: 0, locationLat: 48.85, locationLng: 2.35 }];

    await expect(getDayRouteSummary(events, "drive", null)).resolves.toEqual({ status: "unavailable" });
  });

  it("treats zero coordinates as located stops", async () => {
    mockLimit.mockResolvedValueOnce([{ distanceMeters: 500, durationSeconds: 120, fetchedAt: new Date() }]);

    await expect(
      getDayRouteSummary(
        [
          { id: "origin", name: "Origin", position: 0, locationLat: 0, locationLng: 0 },
          { id: "destination", name: "Destination", position: 1, locationLat: 0.01, locationLng: 0.01 },
        ],
        "drive",
        null
      )
    ).resolves.toEqual({ status: "ready", totalDistanceMeters: 500, totalDurationSeconds: 120, hopCount: 1 });
  });

  it("aggregates all hops when every hop succeeds", async () => {
    mockLimit.mockResolvedValueOnce([{ distanceMeters: 500, durationSeconds: 120, fetchedAt: new Date() }]);

    const result = await getDayRouteSummary(
      [
        { id: "first", name: "First", position: 0, locationLat: 48.85, locationLng: 2.35 },
        { id: "second", name: "Second", position: 1, locationLat: 48.855, locationLng: 2.355 },
      ],
      "drive",
      null
    );

    expect(result).toEqual({ status: "ready", totalDistanceMeters: 500, totalDurationSeconds: 120, hopCount: 1 });
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

describe("getDayScheduleConflicts — two-phase mode resolution", () => {
  const located = (id: string, position: number, startAt: string, endAt: string, lat: number, lng: number) => ({
    id,
    name: id,
    position,
    locationLat: lat,
    locationLng: lng,
    startAt,
    endAt,
  });

  const nearConflictEvents = [
    located("hotel", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:00:00Z", NEAR_ORIGIN.lat, NEAR_ORIGIN.lng),
    located("museum", 1, "2026-07-15T09:05:00Z", "2026-07-15T09:20:00Z", NEAR_DESTINATION.lat, NEAR_DESTINATION.lng),
  ];
  const farConflictEvents = [
    located("hotel", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:00:00Z", NEAR_ORIGIN.lat, NEAR_ORIGIN.lng),
    located("museum", 1, "2026-07-15T09:05:00Z", "2026-07-15T09:20:00Z", FAR_DESTINATION.lat, FAR_DESTINATION.lng),
  ];

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });

  it("classifies a conflict using the walk route's duration when the default-mode route resolves to walk", async () => {
    stubFetchByProfile({
      driving: { distance: 350, duration: 100 },
      walking: { distance: 300, duration: 250 },
    });

    const result = await getDayScheduleConflicts(nearConflictEvents, "trip-1", "drive", 400);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toContain("/directions/v5/mapbox/driving/");
    expect(calls[1][0]).toContain("/directions/v5/mapbox/walking/");
    expect(result).toEqual([
      {
        eventIndex: 1,
        previousEventId: "hotel",
        currentEventId: "museum",
        travelTimeSeconds: 250,
        scheduledGapSeconds: 300,
      },
    ]);
  });

  it("does not refetch when the default-mode route's distance keeps the trip default mode", async () => {
    stubFetchByProfile({ driving: { distance: 450, duration: 100 } });

    const result = await getDayScheduleConflicts(nearConflictEvents, "trip-1", "drive", 400);

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        eventIndex: 1,
        previousEventId: "hotel",
        currentEventId: "museum",
        travelTimeSeconds: 100,
        scheduledGapSeconds: 300,
      },
    ]);
  });

  it("skips mode evaluation when straight-line distance is at or over the threshold", async () => {
    stubFetchByProfile({ driving: { distance: 50, duration: 30 } });

    const result = await getDayScheduleConflicts(farConflictEvents, "trip-1", "drive", 400);

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        eventIndex: 1,
        previousEventId: "hotel",
        currentEventId: "museum",
        travelTimeSeconds: 30,
        scheduledGapSeconds: 300,
      },
    ]);
  });

  it("never issues a duplicate walk request when the trip default mode is already walk", async () => {
    stubFetchByProfile({ walking: { distance: 150, duration: 200 } });

    const result = await getDayScheduleConflicts(nearConflictEvents, "trip-1", "walk", 400);

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual([
      {
        eventIndex: 1,
        previousEventId: "hotel",
        currentEventId: "museum",
        travelTimeSeconds: 200,
        scheduledGapSeconds: 300,
      },
    ]);
  });

  it("skips a hop without a walk refetch when the default-mode route is unavailable", async () => {
    stubFetchByProfile({});

    const result = await getDayScheduleConflicts(nearConflictEvents, "trip-1", "drive", 400);

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toEqual([]);
  });

  it("skips a hop when the walk refetch is unavailable instead of classifying it with the default-mode route", async () => {
    stubFetchByProfile({ driving: { distance: 350, duration: 100 } });

    const result = await getDayScheduleConflicts(nearConflictEvents, "trip-1", "drive", 400);

    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toContain("/directions/v5/mapbox/driving/");
    expect(calls[1][0]).toContain("/directions/v5/mapbox/walking/");
    expect(result).toEqual([]);
  });
});

describe("getDayScheduleConflicts — concurrent hop resolution", () => {
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MAPBOX_ACCESS_TOKEN;
  });

  const located = (id: string, position: number, startAt: string, endAt: string, lat: number, lng: number) => ({
    id,
    name: id,
    position,
    locationLat: lat,
    locationLng: lng,
    startAt,
    endAt,
  });

  const threeStopConflictEvents = [
    located("hotel", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:00:00Z", 48.85, 2.35),
    located("museum", 1, "2026-07-15T09:05:00Z", "2026-07-15T09:20:00Z", 48.855, 2.355),
    located("cafe", 2, "2026-07-15T09:25:00Z", "2026-07-15T09:40:00Z", 48.86, 2.36),
  ];

  it("starts both hops before either settles, and keeps conflicts ordered by event index when they resolve out of order", async () => {
    const { fetchMock, resolvers } = createDeferredFetch();

    const conflictsPromise = getDayScheduleConflicts(threeStopConflictEvents, "trip-1", "drive", null);

    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Resolve the second hop (later event index) first to prove output order tracks input index, not settle order.
    resolvers[1](jsonResponse(500, 700));
    resolvers[0](jsonResponse(500, 700));

    await expect(conflictsPromise).resolves.toEqual([
      {
        eventIndex: 1,
        previousEventId: "hotel",
        currentEventId: "museum",
        travelTimeSeconds: 700,
        scheduledGapSeconds: 300,
      },
      {
        eventIndex: 2,
        previousEventId: "museum",
        currentEventId: "cafe",
        travelTimeSeconds: 700,
        scheduledGapSeconds: 300,
      },
    ]);
  });

  it("skips an unavailable hop during concurrent settlement while still classifying the ready hop", async () => {
    const { fetchMock, resolvers } = createDeferredFetch();

    const conflictsPromise = getDayScheduleConflicts(threeStopConflictEvents, "trip-1", "drive", null);

    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolvers[0](unavailableResponse);
    resolvers[1](jsonResponse(500, 700));

    await expect(conflictsPromise).resolves.toEqual([
      {
        eventIndex: 2,
        previousEventId: "museum",
        currentEventId: "cafe",
        travelTimeSeconds: 700,
        scheduledGapSeconds: 300,
      },
    ]);
  });
});

describe("getDayScheduleConflicts", () => {
  const located = (id: string, position: number, startAt: string, endAt: string, lat = 48.85, lng = 2.35) => ({
    id,
    name: id,
    position,
    locationLat: lat,
    locationLng: lng,
    startAt,
    endAt,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns no conflicts with no events", async () => {
    await expect(getDayScheduleConflicts([], "trip-1", "drive", null)).resolves.toEqual([]);
  });

  it("returns no conflicts with a single timed located item", async () => {
    const events = [located("one", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:30:00Z")];

    await expect(getDayScheduleConflicts(events, "trip-1", "drive", null)).resolves.toEqual([]);
  });

  it("flags a conflict when travel time plus the buffer exceeds the scheduled gap", async () => {
    mockLimit.mockResolvedValueOnce([{ distanceMeters: 500, durationSeconds: 700, fetchedAt: new Date() }]);

    const events = [
      located("hotel", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:30:00Z"),
      located("museum", 1, "2026-07-15T09:35:00Z", "2026-07-15T10:30:00Z"),
    ];

    await expect(getDayScheduleConflicts(events, "trip-1", "drive", null)).resolves.toEqual([
      {
        eventIndex: 1,
        previousEventId: "hotel",
        currentEventId: "museum",
        travelTimeSeconds: 700,
        scheduledGapSeconds: 300,
      },
    ]);
  });

  it("does not flag a conflict when the scheduled gap comfortably fits travel time", async () => {
    mockLimit.mockResolvedValueOnce([{ distanceMeters: 500, durationSeconds: 300, fetchedAt: new Date() }]);

    const events = [
      located("hotel", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:00:00Z"),
      located("museum", 1, "2026-07-15T10:30:00Z", "2026-07-15T11:00:00Z"),
    ];

    await expect(getDayScheduleConflicts(events, "trip-1", "drive", null)).resolves.toEqual([]);
  });

  it("skips a Freeform Item between two Located Items and evaluates the bounding hop directly", async () => {
    mockLimit.mockResolvedValueOnce([{ distanceMeters: 500, durationSeconds: 1000, fetchedAt: new Date() }]);

    const events = [
      located("cafe", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:00:00Z"),
      { id: "note", name: "note", position: 1 },
      located("landmark", 2, "2026-07-15T09:20:00Z", "2026-07-15T09:40:00Z"),
    ];

    await expect(getDayScheduleConflicts(events, "trip-1", "drive", null)).resolves.toEqual([
      {
        eventIndex: 1,
        previousEventId: "cafe",
        currentEventId: "landmark",
        travelTimeSeconds: 1000,
        scheduledGapSeconds: 1200,
      },
    ]);
    expect(mockLimit).toHaveBeenCalledTimes(1);
  });

  it("excludes events missing startAt or endAt from evaluation", async () => {
    const events = [
      { id: "one", name: "one", position: 0, locationLat: 48.85, locationLng: 2.35, startAt: "2026-07-15T09:00:00Z" },
      located("two", 1, "2026-07-15T09:05:00Z", "2026-07-15T09:30:00Z"),
    ];

    await expect(getDayScheduleConflicts(events, "trip-1", "drive", null)).resolves.toEqual([]);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("produces no conflict when route data is unavailable for a hop", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const events = [
      located("hotel", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:00:00Z"),
      located("museum", 1, "2026-07-15T09:01:00Z", "2026-07-15T09:30:00Z"),
    ];

    await expect(getDayScheduleConflicts(events, "trip-1", "drive", null)).resolves.toEqual([]);
  });

  it("evaluates every adjacent pair even when one hop's route is unavailable", async () => {
    mockLimit
      .mockResolvedValueOnce([{ distanceMeters: 500, durationSeconds: 700, fetchedAt: new Date() }])
      .mockResolvedValueOnce([]);

    const events = [
      located("a", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:30:00Z", 48.85, 2.35),
      located("b", 1, "2026-07-15T09:35:00Z", "2026-07-15T10:00:00Z", 48.86, 2.36),
      located("c", 2, "2026-07-15T10:05:00Z", "2026-07-15T10:30:00Z", 48.87, 2.37),
    ];

    await expect(getDayScheduleConflicts(events, "trip-1", "drive", null)).resolves.toEqual([
      {
        eventIndex: 1,
        previousEventId: "a",
        currentEventId: "b",
        travelTimeSeconds: 700,
        scheduledGapSeconds: 300,
      },
    ]);
  });

  it("does not flag a conflict exactly at the 10-minute buffer boundary", async () => {
    mockLimit.mockResolvedValueOnce([{ distanceMeters: 500, durationSeconds: 300, fetchedAt: new Date() }]);

    const events = [
      located("hotel", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:00:00Z"),
      located("museum", 1, "2026-07-15T09:15:00Z", "2026-07-15T09:30:00Z"),
    ];

    await expect(getDayScheduleConflicts(events, "trip-1", "drive", null)).resolves.toEqual([]);
  });

  it("flags a conflict one second past the 10-minute buffer boundary", async () => {
    mockLimit.mockResolvedValueOnce([{ distanceMeters: 500, durationSeconds: 301, fetchedAt: new Date() }]);

    const events = [
      located("hotel", 0, "2026-07-15T09:00:00Z", "2026-07-15T09:00:00Z"),
      located("museum", 1, "2026-07-15T09:15:00Z", "2026-07-15T09:30:00Z"),
    ];

    await expect(getDayScheduleConflicts(events, "trip-1", "drive", null)).resolves.toEqual([
      {
        eventIndex: 1,
        previousEventId: "hotel",
        currentEventId: "museum",
        travelTimeSeconds: 301,
        scheduledGapSeconds: 900,
      },
    ]);
  });
});
