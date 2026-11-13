// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { assertWithinRateLimit, mockSearchBoxSuggest, mockSearchBoxRetrieve } = vi.hoisted(() => ({
  assertWithinRateLimit: vi.fn(),
  mockSearchBoxSuggest: vi.fn(),
  mockSearchBoxRetrieve: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ assertWithinRateLimit }));
vi.mock("@mapbox/search-js-core", () => ({
  SearchBoxCore: vi.fn(function (this: Record<string, unknown>) {
    this.suggest = mockSearchBoxSuggest;
    this.retrieve = mockSearchBoxRetrieve;
  }),
  SessionToken: vi.fn(function () {}),
}));
import { searchCoverImages, resolveDestinationCenter } from "./cover-search";
import { MAX_COVER_SEARCH_PAGE, MAX_COVER_SEARCH_PAGE_SIZE } from "@/lib/validation-limits";
const actor = { userId: "user-1" };
describe("searchCoverImages", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps Unsplash response to the action return shape", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "abc123",
            urls: { regular: "https://images.unsplash.com/abc" },
            user: {
              name: "John Photographer",
              links: { html: "https://unsplash.com/@john-photographer" },
            },
            alt_description: "Tokyo skyline",
            description: null,
          },
        ],
      }),
    });

    await expect(searchCoverImages(actor, "Tokyo")).resolves.toEqual([
      {
        id: "abc123",
        url: "https://images.unsplash.com/abc",
        photographer: "John Photographer",
        photographerUrl: "https://unsplash.com/@john-photographer",
        alt: "Tokyo skyline",
      },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.unsplash.com/search/photos?query=Tokyo+travel&orientation=landscape&page=1&per_page=19",
      {
        signal: expect.any(AbortSignal),
        headers: {
          Authorization: "Client-ID test-unsplash-key",
        },
      }
    );
  });

  it("simplifies verbose location queries to city + region before calling Unsplash", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await searchCoverImages(actor, "Heber City, Utah, United States");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=Heber%20City%2C%20Utah+travel"),
      expect.anything()
    );
  });

  it("leaves 2-part location queries unchanged", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await searchCoverImages(actor, "Paris, France");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=Paris%2C%20France+travel"),
      expect.anything()
    );
  });

  it("leaves single-part queries unchanged", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await searchCoverImages(actor, "Tokyo");

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("query=Tokyo+travel"), expect.anything());
  });

  it("throws when Unsplash returns a non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(searchCoverImages(actor, "Tokyo")).rejects.toThrow("Unsplash search error: 401");
  });

  it("throws when the Unsplash key is missing", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");

    await expect(searchCoverImages(actor, "Tokyo")).rejects.toThrow("UNSPLASH_ACCESS_KEY is not configured");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when query is empty", async () => {
    await expect(searchCoverImages(actor, "")).rejects.toThrow("Search query must not be empty");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when fetch network request fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    await expect(searchCoverImages(actor, "Tokyo")).rejects.toThrow("Unsplash search request failed: Network failure");
  });

  it("throws when response JSON is malformed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    await expect(searchCoverImages(actor, "Tokyo")).rejects.toThrow("Unsplash search request failed");
  });

  it("returns empty array when results are empty", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await expect(searchCoverImages(actor, "Tokyo")).resolves.toEqual([]);
  });

  it("uses description as fallback when alt_description is null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "xyz",
            urls: { regular: "https://images.unsplash.com/xyz" },
            user: { name: "Jane", links: { html: "https://unsplash.com/@jane" } },
            alt_description: null,
            description: "A beautiful view",
          },
        ],
      }),
    });

    const result = await searchCoverImages(actor, "Paris");
    expect(result[0].alt).toBe("A beautiful view");
  });

  it("uses empty string when both alt_description and description are null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "xyz",
            urls: { regular: "https://images.unsplash.com/xyz" },
            user: { name: "Jane", links: { html: "https://unsplash.com/@jane" } },
            alt_description: null,
            description: null,
          },
        ],
      }),
    });

    const result = await searchCoverImages(actor, "Paris");
    expect(result[0].alt).toBe("");
  });

  it("returns stub photographer profile urls in E2E mode", async () => {
    vi.stubEnv("E2E_UNSPLASH_STUB", "true");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");

    const results = await searchCoverImages(actor, "Paris", { page: 1, perPage: 2 });

    expect(results).toEqual([
      expect.objectContaining({
        id: "stub-paris-1",
        photographer: "Stub Photographer 1",
        photographerUrl: "https://unsplash.com/@stub-photographer-1",
        alt: "Paris travel photo 1",
      }),
      expect.objectContaining({
        id: "stub-paris-2",
        photographer: "Stub Photographer 2",
        photographerUrl: "https://unsplash.com/@stub-photographer-2",
        alt: "Paris travel photo 2",
      }),
    ]);
    expect(results[0]?.url).toContain("data:image/svg+xml");
    expect(results[1]?.url).toContain("data:image/svg+xml");

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("search budgets and caps", () => {
  const mockFetch = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "key");
    assertWithinRateLimit.mockImplementation(() => undefined);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const overBudget = () =>
    assertWithinRateLimit.mockImplementation(() => {
      throw new Error("Too many requests");
    });
  it("searchCoverImages spends the Unsplash budget before calling Unsplash", async () => {
    overBudget();

    await expect(searchCoverImages(actor, "Tokyo")).rejects.toThrow("Too many requests");

    expect(assertWithinRateLimit).toHaveBeenCalledWith("unsplashSearch", "user-1");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("searchCoverImages leaves the E2E stub outside the budget", async () => {
    vi.stubEnv("E2E_UNSPLASH_STUB", "true");

    await searchCoverImages(actor, "Tokyo", { perPage: 2 });

    expect(assertWithinRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ["perPage above the Unsplash maximum", { perPage: MAX_COVER_SEARCH_PAGE_SIZE + 1 }],
    ["a fractional perPage", { perPage: 2.5 }],
    ["page above the cap", { page: MAX_COVER_SEARCH_PAGE + 1 }],
    ["a fractional page", { page: 1.5 }],
    ["NaN perPage", { perPage: Number.NaN }],
  ])("searchCoverImages rejects %s before spending a request", async (_label, options) => {
    await expect(searchCoverImages(actor, "Tokyo", options)).rejects.toThrow(/Search page/);

    expect(assertWithinRateLimit).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("searchCoverImages accepts the largest page and page size", async () => {
    await searchCoverImages(actor, "Tokyo", { page: MAX_COVER_SEARCH_PAGE, perPage: MAX_COVER_SEARCH_PAGE_SIZE });

    expect(mockFetch.mock.calls[0][0]).toContain(
      `page=${MAX_COVER_SEARCH_PAGE}&per_page=${MAX_COVER_SEARCH_PAGE_SIZE}`
    );
  });
});

describe("destination center", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "token");
    mockSearchBoxSuggest.mockResolvedValue({ suggestions: [{ mapbox_id: "place" }] });
    mockSearchBoxRetrieve.mockResolvedValue({ features: [{ geometry: { coordinates: [2, 48] } }] });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("returns null for an empty name or missing token without spending budget", async () => {
    expect(await resolveDestinationCenter(actor, " ")).toBeNull();
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");
    expect(await resolveDestinationCenter(actor, "Paris")).toBeNull();
    expect(assertWithinRateLimit).not.toHaveBeenCalled();
  });
  it("keeps the E2E stub outside the budget", async () => {
    vi.stubEnv("E2E_MAPBOX_STUB", "true");
    expect(await resolveDestinationCenter(actor, "Paris")).toEqual([2.3488, 48.8534]);
    expect(assertWithinRateLimit).not.toHaveBeenCalled();
  });
  it("resolves coordinates using the actor budget", async () => {
    expect(await resolveDestinationCenter(actor, "Paris")).toEqual([2, 48]);
    expect(assertWithinRateLimit).toHaveBeenCalledWith("mapboxSearch", "user-1");
  });
  it("lets budget errors reach the transport", async () => {
    assertWithinRateLimit.mockImplementation(() => {
      throw new Error("Too many requests");
    });
    await expect(resolveDestinationCenter(actor, "Paris")).rejects.toThrow("Too many requests");
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
  });
  it("returns null for missing suggestions or geometry and upstream errors", async () => {
    mockSearchBoxSuggest.mockResolvedValueOnce({ suggestions: [] });
    expect(await resolveDestinationCenter(actor, "Paris")).toBeNull();
    mockSearchBoxRetrieve.mockResolvedValueOnce({ features: [{}] });
    expect(await resolveDestinationCenter(actor, "Paris")).toBeNull();
    mockSearchBoxSuggest.mockRejectedValueOnce(new Error("offline"));
    expect(await resolveDestinationCenter(actor, "Paris")).toBeNull();
  });
});

describe("upstream failure bounds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "key");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "token");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("aborts Unsplash at ten seconds and clears its timer", async () => {
    const fetch = vi.fn(
      (_url: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))
    );
    vi.stubGlobal("fetch", fetch);
    const pending = expect(searchCoverImages(actor, "Paris")).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(9999);
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts Mapbox at ten seconds and resolves null", async () => {
    mockSearchBoxSuggest.mockImplementation(
      (_name: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))))
    );
    const pending = resolveDestinationCenter(actor, "Paris");
    await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("normalizes non-Error Unsplash failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("offline"));
    await expect(searchCoverImages(actor, "Paris")).rejects.toThrow("Unsplash search request failed: Unknown error");
  });
});
