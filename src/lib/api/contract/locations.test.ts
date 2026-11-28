// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { retrieveLocation, searchLocations } from "./locations";

const search = { query: "Paris", mode: "destination", sessionToken: "session" };
const retrieve = { mapboxId: "mapbox-id", sessionToken: "session" };

describe("searchLocations", () => {
  it("is a GET on the search path", () => {
    expect(searchLocations).toMatchObject({ method: "GET", path: "/api/v1/locations/search" });
  });

  it.each(["destination", "address"])("accepts mode %s and trims the query", (mode) => {
    expect(searchLocations.body.parse({ ...search, mode, query: "  Paris " })).toEqual({ ...search, mode });
  });

  it("accepts the longest query and session token", () => {
    const longest = {
      ...search,
      query: "q".repeat(FIELD_LIMITS.locationAddress),
      sessionToken: "s".repeat(255),
    };

    expect(searchLocations.body.safeParse(longest).success).toBe(true);
  });

  it.each([
    ["a blank query", { ...search, query: "   " }],
    ["a long query", { ...search, query: "q".repeat(FIELD_LIMITS.locationAddress + 1) }],
    ["an unknown mode", { ...search, mode: "location" }],
    ["no mode", { query: "Paris", sessionToken: "session" }],
    ["a blank session token", { ...search, sessionToken: " " }],
    ["a long session token", { ...search, sessionToken: "s".repeat(256) }],
    ["no session token", { query: "Paris", mode: "address" }],
    ["an extra field", { ...search, limit: "10" }],
  ])("rejects %s", (_name, input) => {
    expect(searchLocations.body.safeParse(input).success).toBe(false);
  });
});

describe("retrieveLocation", () => {
  it("is a GET on the retrieve path", () => {
    expect(retrieveLocation).toMatchObject({ method: "GET", path: "/api/v1/locations/retrieve" });
  });

  it("accepts the longest Mapbox ID and session token", () => {
    const longest = { mapboxId: "m".repeat(2048), sessionToken: "s".repeat(255) };

    expect(retrieveLocation.body.parse(longest)).toEqual(longest);
  });

  it.each([
    ["a blank Mapbox ID", { ...retrieve, mapboxId: " " }],
    ["a long Mapbox ID", { ...retrieve, mapboxId: "m".repeat(2049) }],
    ["no Mapbox ID", { sessionToken: "session" }],
    ["a blank session token", { ...retrieve, sessionToken: "" }],
    ["a long session token", { ...retrieve, sessionToken: "s".repeat(256) }],
    ["no session token", { mapboxId: "mapbox-id" }],
    ["an extra field", { ...retrieve, mode: "address" }],
  ])("rejects %s", (_name, input) => {
    expect(retrieveLocation.body.safeParse(input).success).toBe(false);
  });
});
