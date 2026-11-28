// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitError } from "@/lib/rate-limit";
import { ValidationFailedError } from "@/lib/services/validation-failed-error";

const { suggest, retrieve, construct, assertWithinRateLimit } = vi.hoisted(() => ({
  suggest: vi.fn(),
  retrieve: vi.fn(),
  construct: vi.fn(),
  assertWithinRateLimit: vi.fn(),
}));

vi.mock("@mapbox/search-js-core", () => ({
  // Regular functions (not arrows) so `new SearchBoxCore()` works as a constructor.
  SearchBoxCore: vi.fn(function (this: Record<string, unknown>, options: unknown) {
    construct(options);
    this.suggest = suggest;
    this.retrieve = retrieve;
  }),
  SessionToken: vi.fn(function (this: Record<string, unknown>, id: string) {
    this.id = id;
  }),
}));

vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  assertWithinRateLimit,
}));

import { retrieveLocation, searchAddressLocations, searchDestinationLocations } from "./locations";

const actor = { userId: "user-1" };

const calls = [
  ["searchDestinationLocations", () => searchDestinationLocations(actor, "Tokyo", "sess")],
  ["searchAddressLocations", () => searchAddressLocations(actor, "Tokyo", "sess")],
  ["retrieveLocation", () => retrieveLocation(actor, "mapbox-id", "sess")],
] as const;

function feature(properties: Record<string, unknown>, coordinates: unknown = [139.69, 35.68]) {
  return { features: [{ type: "Feature", geometry: { type: "Point", coordinates }, properties }] };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token");
  vi.stubEnv("E2E_MAPBOX_STUB", "");
  suggest.mockResolvedValue({ suggestions: [] });
  retrieve.mockResolvedValue(feature({ name: "Tokyo" }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("empty input", () => {
  it.each([
    ["searchDestinationLocations", () => searchDestinationLocations(actor, "  ", "sess"), "query"],
    ["searchAddressLocations", () => searchAddressLocations(actor, "", "sess"), "query"],
    ["retrieveLocation", () => retrieveLocation(actor, "", "sess"), "mapboxId"],
    ["retrieveLocation with a blank ID", () => retrieveLocation(actor, "  ", "sess"), "mapboxId"],
  ])("%s refuses it before anything else, even with the stub on", async (_name, call, field) => {
    vi.stubEnv("E2E_MAPBOX_STUB", "true");

    const failure = await call().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ValidationFailedError);
    expect(Object.keys((failure as ValidationFailedError).fields ?? {})).toEqual([field]);
    expect(assertWithinRateLimit).not.toHaveBeenCalled();
    expect(construct).not.toHaveBeenCalled();
  });

  it("names the refused input", async () => {
    await expect(searchDestinationLocations(actor, " ", "sess")).rejects.toThrow("Search query must not be empty");
    await expect(retrieveLocation(actor, "", "sess")).rejects.toThrow("mapboxId is required");
  });
});

describe("E2E stub", () => {
  const paris = {
    name: "Paris",
    fullAddress: "Paris, France",
    placeName: "Paris, France",
    country: "France",
    countryCode: "FR",
    center: [2.3488, 48.8534],
  };

  beforeEach(() => {
    vi.stubEnv("E2E_MAPBOX_STUB", "true");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");
  });

  afterEach(() => {
    expect(assertWithinRateLimit).not.toHaveBeenCalled();
    expect(construct).not.toHaveBeenCalled();
  });

  it("returns a deterministic destination suggestion", async () => {
    await expect(searchDestinationLocations(actor, "Par", "sess")).resolves.toEqual([
      { placeName: "Paris, France", country: "France", countryCode: "FR", mapboxId: "stub-paris-id" },
    ]);
  });

  it("returns a deterministic address suggestion that is already resolved", async () => {
    await expect(searchAddressLocations(actor, "Par", "sess")).resolves.toEqual([
      { name: "Paris", fullAddress: "Paris, France", mapboxId: "stub-paris-id", resolvedLocation: paris },
    ]);
  });

  it("returns a deterministic location", async () => {
    await expect(retrieveLocation(actor, "stub-paris-id", "sess")).resolves.toEqual(paris);
  });
});

describe("configuration and budget", () => {
  it.each(calls)("%s fails without a token and spends no budget", async (_name, call) => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(call()).rejects.toThrow("MAPBOX_ACCESS_TOKEN is not configured");

    expect(assertWithinRateLimit).not.toHaveBeenCalled();
    expect(construct).not.toHaveBeenCalled();
  });

  it.each(calls)("%s spends the actor's search budget before calling Mapbox", async (_name, call) => {
    assertWithinRateLimit.mockImplementation(() => {
      throw new RateLimitError(7);
    });

    await expect(call()).rejects.toBeInstanceOf(RateLimitError);

    expect(assertWithinRateLimit).toHaveBeenCalledExactlyOnceWith("mapboxSearch", "user-1");
    expect(suggest).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe("searchDestinationLocations", () => {
  it("asks for at most five administrative places in the session", async () => {
    await searchDestinationLocations(actor, "Tokyo", "sess");

    expect(construct).toHaveBeenCalledWith({ accessToken: "test-mapbox-token" });
    expect(suggest).toHaveBeenCalledWith("Tokyo", {
      sessionToken: { id: "sess" },
      types: new Set(["place", "locality", "neighborhood", "region", "country"]),
      limit: 5,
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    ["a country on its own", { name: "France", context: { country: { name: "France" } } }, "France"],
    ["a city", { name: "Tokyo", context: { country: { name: "Japan" } } }, "Tokyo, Japan"],
    [
      "a neighbourhood",
      {
        name: "Brooklyn",
        context: { place: { name: "New York" }, region: { name: "New York" }, country: { name: "United States" } },
      },
      "Brooklyn, New York, United States",
    ],
    [
      "a place with a region",
      {
        name: "Heber",
        context: { place: { name: "Heber City" }, region: { name: "Utah" }, country: { name: "United States" } },
      },
      "Heber, Heber City, Utah, United States",
    ],
    [
      "repeated parts",
      {
        name: "Luxembourg",
        context: {
          place: { name: "Luxembourg" },
          region: { name: "Luxembourg" },
          country: { name: "Luxembourg" },
        },
      },
      "Luxembourg",
    ],
    ["a result without a name or context", {}, ""],
  ])("builds the place name for %s", async (_name, properties, placeName) => {
    suggest.mockResolvedValue({ suggestions: [{ ...properties, mapbox_id: "id-1" }] });

    const [result] = await searchDestinationLocations(actor, "query", "sess");

    expect(result.placeName).toBe(placeName);
  });

  it("maps the country and its code, defaulting to empty strings", async () => {
    suggest.mockResolvedValue({
      suggestions: [
        { name: "Tokyo", mapbox_id: "a", context: { country: { name: "Japan", country_code: "JP" } } },
        { name: "Nowhere", mapbox_id: "b" },
      ],
    });

    await expect(searchDestinationLocations(actor, "query", "sess")).resolves.toEqual([
      { placeName: "Tokyo, Japan", country: "Japan", countryCode: "JP", mapboxId: "a" },
      { placeName: "Nowhere", country: "", countryCode: "", mapboxId: "b" },
    ]);
  });
});

describe("searchAddressLocations", () => {
  it("asks for at most five suggestions of any type", async () => {
    await searchAddressLocations(actor, "Tok", "sess");

    expect(suggest).toHaveBeenCalledWith("Tok", {
      sessionToken: { id: "sess" },
      limit: 5,
      signal: expect.any(AbortSignal),
    });
  });

  it("takes the full address, then the formatted place, then the place name", async () => {
    suggest.mockResolvedValue({
      suggestions: [
        { name: "Tower", full_address: "4 Shibakoen, Tokyo", place_formatted: "Tokyo", mapbox_id: "a" },
        { name: "Paris", place_formatted: "Paris, France", mapbox_id: "b" },
        { name: "Lyon", context: { country: { name: "France" } }, mapbox_id: "c" },
        { context: { country: { name: "France" } }, mapbox_id: "d" },
      ],
    });

    await expect(searchAddressLocations(actor, "query", "sess")).resolves.toEqual([
      { name: "Tower", fullAddress: "4 Shibakoen, Tokyo", mapboxId: "a" },
      { name: "Paris", fullAddress: "Paris, France", mapboxId: "b" },
      { name: "Lyon", fullAddress: "Lyon, France", mapboxId: "c" },
      { name: ", France", fullAddress: ", France", mapboxId: "d" },
    ]);
  });
});

describe("retrieveLocation", () => {
  it("retrieves the feature in the session and maps it", async () => {
    retrieve.mockResolvedValue(
      feature({
        name: "10th arrondissement",
        full_address: "10th arrondissement, Paris, France",
        context: { place: { name: "Paris" }, country: { name: "France", country_code: "FR" } },
      })
    );

    await expect(retrieveLocation(actor, "mapbox-id", "sess")).resolves.toEqual({
      name: "10th arrondissement",
      fullAddress: "10th arrondissement, Paris, France",
      placeName: "10th arrondissement, Paris, France",
      country: "France",
      countryCode: "FR",
      center: [139.69, 35.68],
    });
    expect(retrieve).toHaveBeenCalledWith(
      { mapbox_id: "mapbox-id" },
      { sessionToken: { id: "sess" }, signal: expect.any(AbortSignal) }
    );
  });

  it("falls back to the place name and empty country fields", async () => {
    retrieve.mockResolvedValue(feature({}));

    await expect(retrieveLocation(actor, "mapbox-id", "sess")).resolves.toEqual({
      name: "",
      fullAddress: "",
      placeName: "",
      country: "",
      countryCode: "",
      center: [139.69, 35.68],
    });
  });

  it("fails when no feature is returned", async () => {
    retrieve.mockResolvedValue({ features: [] });

    await expect(retrieveLocation(actor, "mapbox-id", "sess")).rejects.toThrow(
      "Location retrieve failed: No feature returned from retrieve"
    );
  });

  it("fails when the feature has no geometry", async () => {
    retrieve.mockResolvedValue({ features: [{ properties: {} }] });

    await expect(retrieveLocation(actor, "mapbox-id", "sess")).rejects.toThrow("No geometry in retrieve response");
  });

  it.each([
    ["missing", undefined],
    ["short", [2]],
    ["textual", ["2", "48"]],
    ["out of longitude range", [181, 0]],
    ["out of latitude range", [0, -91]],
    ["not finite", [Number.NaN, 0]],
  ])("fails when the coordinates are %s", async (_name, coordinates) => {
    retrieve.mockResolvedValue({ features: [{ geometry: { type: "Point", coordinates }, properties: {} }] });

    await expect(retrieveLocation(actor, "mapbox-id", "sess")).rejects.toThrow(
      "Location retrieve failed: Invalid coordinates in retrieve response"
    );
  });
});

describe("provider failures", () => {
  it.each([
    [calls[0][0], calls[0][1], suggest, "Location search failed"],
    [calls[1][0], calls[1][1], suggest, "Location search failed"],
    [calls[2][0], calls[2][1], retrieve, "Location retrieve failed"],
  ])("%s wraps thrown errors and unknown values", async (_name, call, provider, prefix) => {
    provider.mockRejectedValueOnce(new Error("Network failure"));
    await expect(call()).rejects.toThrow(`${prefix}: Network failure`);

    provider.mockRejectedValueOnce("nope");
    await expect(call()).rejects.toThrow(`${prefix}: Unknown error`);
  });

  it.each([
    [calls[0][0], calls[0][1], suggest],
    [calls[1][0], calls[1][1], suggest],
    [calls[2][0], calls[2][1], retrieve],
  ])("%s aborts Mapbox after ten seconds", async (_name, call, provider) => {
    vi.useFakeTimers();
    provider.mockImplementation(
      (_input: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    const settled = vi.fn();
    const outcome = call().catch((error: Error) => {
      settled();
      return error.message;
    });

    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(outcome).resolves.toMatch(/failed: aborted$/);
  });
});
