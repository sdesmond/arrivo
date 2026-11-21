// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  put: vi.fn(),
  search: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ put: mocks.put }) }));
vi.mock("@/lib/services/cover-search", () => ({ searchCoverImages: mocks.search }));

import { deriveGraphicCover } from "@/lib/utils";
import { MAP_TILE_TIMEOUT_MS, generateTripCover } from "./trip-cover-generation";

const mockFetch = vi.fn();

function storedCoverType(defaultCoverType: string | null) {
  mocks.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ defaultCoverType }] }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const base = { userId: "user-1", tripId: "trip-1", name: "Paris Trip" };

describe("generateTripCover", () => {
  it("uses a graphic without reading preferences when there is no destination", async () => {
    await expect(generateTripCover(base)).resolves.toEqual({ coverImageUrl: deriveGraphicCover("Paris Trip") });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("uses a graphic when the user's default is graphic", async () => {
    storedCoverType("graphic");
    await expect(generateTripCover({ ...base, destinationName: "Paris" })).resolves.toEqual({
      coverImageUrl: deriveGraphicCover("Paris Trip"),
    });
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("takes the first photo hit, with photographer credit, by default", async () => {
    storedCoverType(null);
    mocks.search.mockResolvedValue([
      { url: "https://images.example/a.jpg", photographer: "Ann", photographerUrl: "https://unsplash.com/@ann" },
      { url: "https://images.example/b.jpg" },
    ]);
    await expect(generateTripCover({ ...base, destinationName: "Paris" })).resolves.toEqual({
      coverImageUrl: "https://images.example/a.jpg",
      coverPhotographer: "Ann",
      coverPhotographerUrl: "https://unsplash.com/@ann",
    });
    expect(mocks.search).toHaveBeenCalledWith({ userId: "user-1" }, "Paris");
  });

  it("returns null when the photo search finds nothing", async () => {
    storedCoverType("photo");
    mocks.search.mockResolvedValue([]);
    await expect(generateTripCover({ ...base, destinationName: "Nowhere" })).resolves.toBeNull();
  });

  it("falls back to photo for an unknown stored cover type", async () => {
    storedCoverType("bogus");
    mocks.search.mockResolvedValue([{ url: "https://images.example/a.jpg" }]);
    await expect(generateTripCover({ ...base, destinationName: "Paris" })).resolves.toEqual({
      coverImageUrl: "https://images.example/a.jpg",
    });
  });

  it("fetches the Mapbox tile and stores it through the storage adapter", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "token");
    vi.spyOn(crypto, "randomUUID").mockReturnValue("cover-1234");
    storedCoverType("map");
    mockFetch.mockResolvedValue({ ok: true, blob: async () => new Blob(["bytes"], { type: "image/jpeg" }) });
    mocks.put.mockResolvedValue("/api/storage/trip-covers/trip-1/cover-1234.jpg");
    await expect(
      generateTripCover({ ...base, destinationName: "Paris", destinationCenter: [2.3488, 48.8534] })
    ).resolves.toEqual({ coverImageUrl: "/api/storage/trip-covers/trip-1/cover-1234.jpg" });
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/2.3488,48.8534,10/600x400@2x?access_token=token",
      { signal: expect.any(AbortSignal) }
    );
    expect(mocks.put).toHaveBeenCalledWith("trip-covers/trip-1/cover-1234.jpg", expect.any(File));
  });

  it("gives up on a tile fetch that outlasts the timeout and stores nothing", async () => {
    const timeout = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    storedCoverType("map");
    mockFetch.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason));
        })
    );
    const cover = generateTripCover({ ...base, destinationName: "Paris", destinationCenter: [1, 2] });
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(timeoutSpy).toHaveBeenCalledWith(MAP_TILE_TIMEOUT_MS);
    timeout.abort(new DOMException("timed out", "TimeoutError"));
    await expect(cover).resolves.toBeNull();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("does nothing for the map type without coordinates", async () => {
    storedCoverType("map");
    await expect(generateTripCover({ ...base, destinationName: "Paris" })).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("logs a failed tile fetch and returns null", async () => {
    storedCoverType("map");
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      generateTripCover({ ...base, destinationName: "Paris", destinationCenter: [1, 2] })
    ).resolves.toBeNull();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("logs a thrown search and returns null", async () => {
    storedCoverType("photo");
    mocks.search.mockRejectedValue(new Error("down"));
    await expect(generateTripCover({ ...base, destinationName: "Paris" })).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith("Cover image fetch failed:", expect.any(Error));
  });
});
