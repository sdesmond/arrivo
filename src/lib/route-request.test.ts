// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelect, mockFrom, mockWhere } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockWhere: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mockSelect } }));
vi.mock("@/db/schema", () => ({ events: { id: "id", tripId: "tripId" } }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), inArray: vi.fn() }));

import {
  assertEventsBelongToTrip,
  parseDayRouteBody,
  parseDistanceBody,
  readJsonObject,
  routeJson,
} from "./route-request";
import { MAX_ROUTE_EVENTS } from "./validation-limits";

const event = { id: "event-1", name: "Museum", position: 0, locationLat: 48.85, locationLng: 2.35 };

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
}

describe("assertEventsBelongToTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
  });

  it("skips the query for an empty event list", async () => {
    await expect(assertEventsBelongToTrip("trip-1", [])).resolves.toBeUndefined();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("passes when every event belongs to the trip", async () => {
    mockWhere.mockResolvedValue([{ id: "event-1" }]);
    await expect(assertEventsBelongToTrip("trip-1", [event])).resolves.toBeUndefined();
  });

  it("rejects when any event is foreign", async () => {
    mockWhere.mockResolvedValue([{ id: "event-1" }]);
    await expect(assertEventsBelongToTrip("trip-1", [event, { ...event, id: "event-2" }])).rejects.toThrow(
      "Event(s) do not belong to trip"
    );
  });
});

describe("readJsonObject", () => {
  it("returns a parsed JSON object", async () => {
    await expect(readJsonObject(jsonRequest({ a: 1 }))).resolves.toEqual({ a: 1 });
  });

  it.each([["not json"], ["null"], ["[1]"], ['"text"']])("returns null for %s", async (raw) => {
    const request = new Request("http://localhost/api", { method: "POST", body: raw });
    await expect(readJsonObject(request)).resolves.toBeNull();
  });
});

describe("parseDistanceBody", () => {
  const valid = { origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 }, transitMode: "walk" };

  it("accepts valid coordinates and mode", () => {
    expect(parseDistanceBody(valid)).toEqual(valid);
  });

  it.each([
    ["missing origin", { ...valid, origin: undefined }],
    ["non-numeric lat", { ...valid, origin: { lat: "1", lng: 2 } }],
    ["non-finite lng", { ...valid, destination: { lat: 3, lng: null } }],
    ["unknown mode", { ...valid, transitMode: "teleport" }],
  ])("rejects %s", (_label, body) => {
    expect(parseDistanceBody(body as Record<string, unknown>)).toBeNull();
  });
});

describe("parseDayRouteBody", () => {
  it("accepts events, mode and a numeric threshold", () => {
    expect(parseDayRouteBody({ events: [event], transitMode: "drive", walkThresholdMeters: 400 })).toEqual({
      events: [event],
      transitMode: "drive",
      walkThresholdMeters: 400,
    });
  });

  it("treats an absent or null threshold as null", () => {
    expect(parseDayRouteBody({ events: [], transitMode: "walk" })?.walkThresholdMeters).toBeNull();
    expect(
      parseDayRouteBody({ events: [], transitMode: "walk", walkThresholdMeters: null })?.walkThresholdMeters
    ).toBeNull();
  });

  it("accepts exactly the maximum number of events and rejects one more", () => {
    const atCap = Array.from({ length: MAX_ROUTE_EVENTS }, (_, index) => ({ ...event, id: `event-${index}` }));
    expect(parseDayRouteBody({ events: atCap, transitMode: "walk" })?.events).toHaveLength(MAX_ROUTE_EVENTS);
    expect(parseDayRouteBody({ events: [...atCap, event], transitMode: "walk" })).toBeNull();
  });

  it.each([
    ["events not an array", { events: "x", transitMode: "walk" }],
    ["event without an id", { events: [{ name: "x" }], transitMode: "walk" }],
    ["unknown mode", { events: [], transitMode: "boat" }],
    ["non-numeric threshold", { events: [], transitMode: "walk", walkThresholdMeters: "400" }],
  ])("rejects %s", (_label, body) => {
    expect(parseDayRouteBody(body as Record<string, unknown>)).toBeNull();
  });
});

describe("routeJson", () => {
  it("returns the payload uncached", async () => {
    const response = routeJson({ status: "ready" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ready" });
  });
});
