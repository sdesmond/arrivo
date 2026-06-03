// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collaborators,
  days,
  documents,
  events,
  itineraryChecklists,
  itineraryNotes,
  packingItems,
  packingTemplates,
  trips,
} from "@/db/schema";

const { assertTripAccess, db, requireUser, revalidatePath } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    delete: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
  },
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser,
  assertTripAccess,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

const { blobPut } = vi.hoisted(() => ({
  blobPut: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  del: vi.fn(),
  put: blobPut,
}));

const { mockSearchBoxSuggest, mockSearchBoxRetrieve } = vi.hoisted(() => ({
  mockSearchBoxSuggest: vi.fn(),
  mockSearchBoxRetrieve: vi.fn(),
}));

vi.mock("@mapbox/search-js-core", () => ({
  // Must use regular functions (not arrows) so `new SearchBoxCore()` works as a constructor
  SearchBoxCore: vi.fn(function (this: Record<string, unknown>) {
    this.suggest = mockSearchBoxSuggest;
    this.retrieve = mockSearchBoxRetrieve;
  }),
  SessionToken: vi.fn(function (this: Record<string, unknown>, id?: string) {
    this.id = id ?? "mock-session-token";
  }),
}));

import { buildTripDateChangeConfirmation, buildTripDateSyncPlan, resolveTripDateRange } from "./date-sync";
import {
  addPackingItem,
  createTrip,
  pullTemplatesOntoTrip,
  reorderPackingItems,
  removePackingItem,
  retrieveLocation,
  saveTripListAsTemplate,
  searchLocations,
  togglePackingItem,
  updatePackingItem,
  updateTripMetadata,
} from "./actions";
import { searchCoverImages } from "./cover-image-search-actions";
import { TripDateConflictResolution, type TripDateChangeConfirmation } from "@/data/types";
import { deriveGraphicCover } from "@/lib/utils";

interface TransactionFixture {
  checklistRows?: Array<{ id: string }>;
  eventDocs?: Array<{ eventId: string | null; url: string | null }>;
  existingDays: Array<{ id: string; tripId: string; dayNumber: number; date: string | null; label: string }>;
  noteRows?: Array<{ id: string }>;
  removedEvents?: Array<{ id: string; name: string; dayId: string | null; position: number }>;
  tripRow?: { id: string; startDate: string | null; endDate: string | null };
}

function createTransactionMock({
  checklistRows = [],
  eventDocs = [],
  existingDays,
  noteRows = [],
  removedEvents = [],
  tripRow = { id: "trip-1", startDate: "2026-08-01", endDate: "2026-08-02" },
}: TransactionFixture) {
  const operations = {
    deletes: [] as unknown[],
    inserts: [] as Array<{ table: unknown; values: unknown }>,
    updates: [] as Array<{ table: unknown; values: unknown }>,
  };

  const transaction = {
    select: () => ({
      from: (table: unknown) => {
        if (table === trips) {
          return {
            where: async () => [tripRow],
          };
        }

        if (table === days) {
          return {
            where: () => ({
              orderBy: async () => existingDays,
            }),
          };
        }

        if (table === events) {
          return {
            where: async () => removedEvents,
          };
        }

        if (table === documents) {
          return {
            where: async () => eventDocs,
          };
        }

        if (table === itineraryNotes) {
          return {
            where: async () => noteRows,
          };
        }

        if (table === itineraryChecklists) {
          return {
            where: async () => checklistRows,
          };
        }

        throw new Error("Unexpected table read in test fixture.");
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          operations.updates.push({ table, values });
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        operations.deletes.push(table);
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        operations.inserts.push({ table, values });
      },
    }),
  };

  return { operations, transaction };
}

describe("resolveTripDateRange", () => {
  it("fills a missing end date from the requested start date", () => {
    expect(resolveTripDateRange({}, { startDate: "2026-07-01" })).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-01",
    });
  });

  it("reuses the existing range when the patch omits dates", () => {
    expect(resolveTripDateRange({ startDate: "2026-07-01", endDate: "2026-07-03" }, {})).toEqual({
      startDate: "2026-07-01",
      endDate: "2026-07-03",
    });
  });
});

describe("buildTripDateSyncPlan", () => {
  it("separates added, removed, and retained dates", () => {
    expect(buildTripDateSyncPlan(["2026-07-01", "2026-07-02"], ["2026-07-02", "2026-07-03"])).toEqual({
      desiredDates: ["2026-07-02", "2026-07-03"],
      addedDates: ["2026-07-03"],
      removedDates: ["2026-07-01"],
      retainedDates: ["2026-07-02"],
    });
  });
});

describe("buildTripDateChangeConfirmation", () => {
  it("preserves the confirmation payload structure returned to the client", () => {
    expect(
      buildTripDateChangeConfirmation(
        ["2026-07-04"],
        [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-07-04", docCount: 2 }],
        1,
        2,
        2
      )
    ).toEqual({
      removedDates: ["2026-07-04"],
      events: [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-07-04", docCount: 2 }],
      noteCount: 1,
      checklistCount: 2,
      eventDocumentCount: 2,
    });
  });
});

describe("updateTripMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UPLOAD_STUB = "true";
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("returns confirmation-required before mutating when removed days contain events", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      removedEvents: [{ id: "event-1", name: "Dinner", dayId: "day-2", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", {
      startDate: "2026-08-01",
      endDate: "2026-08-01",
    });

    expect(result).toEqual({
      status: "confirmation-required",
      confirmation: {
        removedDates: ["2026-08-02"],
        events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-08-02", docCount: 0 }],
        noteCount: 0,
        checklistCount: 0,
        eventDocumentCount: 0,
      },
    });
    expect(operations.deletes).toEqual([]);
    expect(operations.updates).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("saves the destructive resolution when the confirmation payload still matches", async () => {
    const confirmation: TripDateChangeConfirmation = {
      removedDates: ["2026-08-02"],
      events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-08-02", docCount: 1 }],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 1,
    };
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      eventDocs: [{ eventId: "event-1", url: "https://example.com/doc.pdf" }],
      removedEvents: [{ id: "event-1", name: "Dinner", dayId: "day-2", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata(
      "trip-1",
      { startDate: "2026-08-01", endDate: "2026-08-01" },
      TripDateConflictResolution.DeleteEvents,
      confirmation
    );

    expect(result).toEqual({ status: "saved" });
    expect(operations.deletes).toContain(events);
    expect(operations.deletes).toContain(days);
    expect(operations.updates.some((entry) => entry.table === trips)).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("rejects a stale confirmation payload instead of deleting newly changed content", async () => {
    const staleConfirmation: TripDateChangeConfirmation = {
      removedDates: ["2026-08-02"],
      events: [{ id: "event-1", name: "Old Dinner", displacedDate: "2026-08-02", docCount: 0 }],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 0,
    };
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
      removedEvents: [{ id: "event-1", name: "Updated Dinner", dayId: "day-2", position: 0 }],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(
      updateTripMetadata(
        "trip-1",
        { startDate: "2026-08-01", endDate: "2026-08-01" },
        TripDateConflictResolution.DeleteEvents,
        staleConfirmation
      )
    ).rejects.toThrow(/review the date change again/i);
    expect(operations.deletes).toEqual([]);
  });

  it("threads destination fields into the trip update without auto-changing the cover", async () => {
    const { operations, transaction } = createTransactionMock({
      existingDays: [
        { id: "day-1", tripId: "trip-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" },
        { id: "day-2", tripId: "trip-1", dayNumber: 2, date: "2026-08-02", label: "Day 2" },
      ],
    });
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await updateTripMetadata("trip-1", {
      destinationName: "Paris, France",
      destinationCountry: "France",
      destinationCountryCode: "FR",
    });

    const tripUpdate = operations.updates.find((entry) => entry.table === trips);
    expect(result).toEqual({ status: "saved" });
    expect(tripUpdate?.values).toEqual(
      expect.objectContaining({
        destinationName: "Paris, France",
        destinationCountry: "France",
        destinationCountryCode: "FR",
        coverImageUrl: undefined,
      })
    );
  });
});

describe("createTrip", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    requireUser.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
    });
  });

  afterEach(() => {
    db.select.mockReset();
    db.transaction.mockReset();
    db.update.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function setupCreateTripDb(defaultCoverType: string | null) {
    const operations = {
      inserts: [] as Array<{ table: unknown; values: unknown }>,
      updates: [] as Array<{ table: unknown; values: unknown }>,
    };
    const createdTrip = { id: "trip-1" };
    const transaction = {
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          operations.inserts.push({ table, values });
          if (table === trips) {
            return {
              returning: async () => [createdTrip],
            };
          }
          return undefined;
        },
      }),
    };

    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );
    db.select
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ id: "user-1", email: "test@example.com", name: "Test User" }],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ defaultCoverType }],
        }),
      });
    db.update.mockImplementation((table: unknown) => ({
      set: (values: unknown) => ({
        where: async () => {
          operations.updates.push({ table, values });
        },
      }),
    }));

    return operations;
  }

  it("stores destination fields and applies the first Unsplash cover when the default is photo", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
    const operations = setupCreateTripDb(null);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "img-1",
            urls: { regular: "https://images.example/paris.jpg" },
            user: { name: "Photographer" },
            alt_description: "Paris skyline",
            description: null,
          },
        ],
      }),
    });

    await expect(
      createTrip({
        name: "Paris Trip",
        destinationName: "Paris, France",
        destinationCountry: "France",
        destinationCountryCode: "FR",
        destinationCenter: [2.35, 48.85],
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.inserts).toEqual(
      expect.arrayContaining([
        {
          table: trips,
          values: expect.objectContaining({
            destinationName: "Paris, France",
            destinationCountry: "France",
            destinationCountryCode: "FR",
          }),
        },
        {
          table: collaborators,
          values: expect.objectContaining({
            tripId: "trip-1",
            role: "owner",
          }),
        },
      ])
    );
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: { coverImageUrl: "https://images.example/paris.jpg" },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("fetches the Mapbox static tile server-side and stores the Blob URL when the default is map", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "mapbox-token");
    vi.stubEnv("UPLOAD_STUB", ""); // override .env UPLOAD_STUB=true for this test
    const operations = setupCreateTripDb("map");
    const fakeBlob = new Blob(["png-bytes"], { type: "image/jpeg" });
    mockFetch.mockResolvedValue({ ok: true, blob: async () => fakeBlob });
    blobPut.mockResolvedValue({ url: "https://blob.vercel.com/mapbox-covers/trip-1.jpg" });

    await expect(
      createTrip({
        name: "Map Trip",
        destinationName: "Paris, France",
        destinationCenter: [2.3488, 48.8534],
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/static/2.3488,48.8534,10/600x400@2x?access_token=mapbox-token"
    );
    expect(blobPut).toHaveBeenCalledWith("mapbox-covers/trip-1.jpg", fakeBlob, { access: "public" });
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: { coverImageUrl: "https://blob.vercel.com/mapbox-covers/trip-1.jpg" },
      },
    ]);
  });

  it("skips blob upload and leaves coverImageUrl null when UPLOAD_STUB is set", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "mapbox-token");
    vi.stubEnv("UPLOAD_STUB", "true");
    const operations = setupCreateTripDb("map");

    await expect(
      createTrip({
        name: "Map Trip",
        destinationName: "Paris, France",
        destinationCenter: [2.3488, 48.8534],
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(blobPut).not.toHaveBeenCalled();
    expect(operations.updates).toEqual([]);
  });

  it("derives a graphic cover without calling external APIs when the default is graphic", async () => {
    const operations = setupCreateTripDb("graphic");

    await expect(
      createTrip({
        name: "Road Trip",
        destinationName: "Paris, France",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: { coverImageUrl: deriveGraphicCover("Road Trip") },
      },
    ]);
  });

  it("swallows cover lookup failures and still completes trip creation", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
    const operations = setupCreateTripDb("photo");
    mockFetch.mockRejectedValue(new Error("Unsplash unavailable"));

    await expect(
      createTrip({
        name: "Fallback Trip",
        destinationName: "Paris, France",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.updates).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("applies graphic cover without loading user preference when no destination is selected (AC6)", async () => {
    const operations = setupCreateTripDb(null);

    await expect(
      createTrip({
        name: "No Destination Trip",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(db.select).toHaveBeenCalledOnce();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(operations.updates).toEqual([
      { table: trips, values: { coverImageUrl: deriveGraphicCover("No Destination Trip") } },
    ]);
  });

  it("applies graphic cover preference when trip has coordinates but no destination name", async () => {
    const operations = setupCreateTripDb("graphic");

    await expect(
      createTrip({
        name: "Coordinates Trip",
        destinationCenter: [2.35, 48.85],
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(db.select).toHaveBeenCalledTimes(2);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(operations.updates).toEqual([
      { table: trips, values: { coverImageUrl: deriveGraphicCover("Coordinates Trip") } },
    ]);
  });
});

describe("searchLocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token");
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Search Box API response to the action return shape", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Tokyo",
          place_formatted: "Tokyo, Japan",
          full_address: "Tokyo, Tokyo, Japan",
          mapbox_id: "dXJuOm1hcGJveA==",
          context: { country: { name: "Japan", country_code: "JP" } },
        },
      ],
    });

    await expect(searchLocations("Tokyo", "test-session-token")).resolves.toEqual([
      {
        placeName: "Tokyo, Japan",
        country: "Japan",
        countryCode: "JP",
        mapboxId: "dXJuOm1hcGJveA==",
      },
    ]);
    expect(requireUser).toHaveBeenCalled();
    expect(mockSearchBoxSuggest).toHaveBeenCalledWith("Tokyo", expect.objectContaining({ limit: 5 }));
  });

  it("includes place when it differs from the feature name (neighborhood)", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "10th arrondissement",
          place_formatted: "Paris, Île-de-France, France",
          full_address: "10th arrondissement, Paris, Île-de-France, France",
          mapbox_id: "abc",
          context: {
            place: { name: "Paris" },
            country: { name: "France", country_code: "FR" },
          },
        },
      ],
    });

    const result = await searchLocations("10th arrondissement", "sess");
    expect(result[0].placeName).toBe("10th arrondissement, Paris, France");
  });

  it("includes the region (state) between name and country", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Heber City",
          place_formatted: "Utah, United States",
          full_address: "Heber City, Utah, United States",
          mapbox_id: "abc",
          context: {
            region: { name: "Utah", region_code: "UT" },
            country: { name: "United States", country_code: "US" },
          },
        },
      ],
    });

    const result = await searchLocations("Heber", "sess");
    expect(result[0].placeName).toBe("Heber City, Utah, United States");
  });

  it("does not duplicate the region when it matches the place", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Brooklyn",
          place_formatted: "New York, New York, United States",
          full_address: "Brooklyn, New York, New York, United States",
          mapbox_id: "abc",
          context: {
            place: { name: "New York" },
            region: { name: "New York", region_code: "NY" },
            country: { name: "United States", country_code: "US" },
          },
        },
      ],
    });

    const result = await searchLocations("Brooklyn", "sess");
    expect(result[0].placeName).toBe("Brooklyn, New York, United States");
  });

  it("returns only the country when feature name matches place and country", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "France",
          place_formatted: "",
          full_address: "",
          mapbox_id: "abc",
          context: {
            country: { name: "France", country_code: "FR" },
          },
        },
      ],
    });

    const result = await searchLocations("France", "sess");
    expect(result[0].placeName).toBe("France");
  });

  it("returns only name when context is empty", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Tokyo",
          place_formatted: "Tokyo, Japan",
          full_address: "",
          mapbox_id: "abc",
          context: {},
        },
      ],
    });

    const result = await searchLocations("Tokyo", "sess");
    expect(result[0].placeName).toBe("Tokyo");
  });

  it("throws when the Mapbox token is missing", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(searchLocations("Tokyo", "sess")).rejects.toThrow("MAPBOX_ACCESS_TOKEN is not configured");
    expect(requireUser).not.toHaveBeenCalled();
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
  });

  it("returns the deterministic E2E stub suggestion when configured", async () => {
    vi.stubEnv("E2E_MAPBOX_STUB", "true");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(searchLocations("Par", "sess")).resolves.toEqual([
      {
        placeName: "Paris, France",
        country: "France",
        countryCode: "FR",
        mapboxId: "stub-paris-id",
      },
    ]);
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
  });

  it("throws when query is empty", async () => {
    await expect(searchLocations("  ", "sess")).rejects.toThrow("Search query must not be empty");
    expect(requireUser).not.toHaveBeenCalled();
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
  });

  it("throws when suggest network request fails", async () => {
    mockSearchBoxSuggest.mockRejectedValue(new Error("Network failure"));

    await expect(searchLocations("Tokyo", "sess")).rejects.toThrow("Location search failed: Network failure");
  });

  it("returns empty array when suggestions are empty", async () => {
    mockSearchBoxSuggest.mockResolvedValue({ suggestions: [] });

    await expect(searchLocations("Tokyo", "sess")).resolves.toEqual([]);
  });
});

describe("packing actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("adds a packing label with the next position after access checks", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ maxPos: 2 }],
      }),
    });
    db.insert.mockReturnValueOnce({
      values: insertValues,
    });

    await addPackingItem("trip-1", { name: "Documents", isLabel: true });

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(db.insert).toHaveBeenCalledWith(packingItems);
    expect(insertValues).toHaveBeenCalledWith({
      tripId: "trip-1",
      name: "Documents",
      done: false,
      isLabel: true,
      position: 3,
      labelId: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("assigns position 0 and ungrouped when the trip has no existing packing items", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ maxPos: null }],
      }),
    });
    db.insert.mockReturnValueOnce({
      values: insertValues,
    });

    await addPackingItem("trip-1", { name: "Passport" });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ position: 0, labelId: null }));
  });

  it("quick-add appends a plain item ungrouped at the bottom (AC4), not under the last section", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ maxPos: 4 }],
      }),
    });
    db.insert.mockReturnValueOnce({ values: insertValues });

    await addPackingItem("trip-1", { name: "Phone charger" });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ position: 5, labelId: null }));
  });

  it("removes a packing entry only after loading the item and checking trip access", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ id: "pack-1", tripId: "trip-1" }],
      }),
    });
    db.delete.mockReturnValueOnce({
      where: deleteWhere,
    });

    await removePackingItem("pack-1");

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(db.delete).toHaveBeenCalledWith(packingItems);
    expect(deleteWhere).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("toggles a packing entry and revalidates both the trip detail and trips list", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ id: "pack-1", tripId: "trip-1", done: false }],
      }),
    });
    db.update.mockReturnValueOnce({
      set: () => ({
        where: updateWhere,
      }),
    });

    await togglePackingItem("pack-1");

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(db.update).toHaveBeenCalledWith(packingItems);
    expect(updateWhere).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("reorders packing entries after access checks and revalidates the trip detail route", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [{ id: "label-1" }],
        }),
      })),
      update: vi.fn(() => ({
        set: (values: unknown) => ({
          where: async () => {
            updateWhere(values);
          },
        }),
      })),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await reorderPackingItems("trip-1", [
      { id: "pack-2", labelId: null, position: 0 },
      { id: "pack-1", labelId: "label-1", position: 1 },
      { id: "pack-3", labelId: null, position: 2 },
    ]);

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(transaction.update).toHaveBeenCalledTimes(3);
    expect(updateWhere).toHaveBeenNthCalledWith(1, { position: 0, labelId: null });
    expect(updateWhere).toHaveBeenNthCalledWith(2, { position: 1, labelId: "label-1" });
    expect(updateWhere).toHaveBeenNthCalledWith(3, { position: 2, labelId: null });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("reorderPackingItems is a no-op for an empty ordering", async () => {
    await reorderPackingItems("trip-1", []);

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(db.transaction).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("updatePackingItem trims the name before updating it in DB", async () => {
    const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ id: "pack-1", tripId: "trip-1", name: "Passport" }],
      }),
    });
    db.update.mockReturnValueOnce({ set: updateSet });

    await updatePackingItem("pack-1", { name: "  Passport (renewed)  " });

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(db.update).toHaveBeenCalledWith(packingItems);
    expect(updateSet).toHaveBeenCalledWith({ name: "Passport (renewed)" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("updatePackingItem throws when item not found", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({ where: async () => [] }),
    });

    await expect(updatePackingItem("nonexistent", { name: "New name" })).rejects.toThrow("Packing item not found");

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updatePackingItem rejects a blank trimmed name", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ id: "pack-1", tripId: "trip-1", name: "Passport" }],
      }),
    });

    await expect(updatePackingItem("pack-1", { name: "   " })).rejects.toThrow("Packing item name is required");

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("addPackingItem with afterItemId inserts at targetPos + 1 and shifts later items", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const shiftWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [{ id: "label-1", tripId: "trip-1", position: 2 }],
        }),
      })),
      update: vi.fn(() => ({
        set: () => ({
          where: shiftWhere,
        }),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await addPackingItem("trip-1", { name: "Visa", afterItemId: "label-1" });

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(transaction.select).toHaveBeenCalled();
    expect(transaction.update).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ name: "Visa", position: 3, tripId: "trip-1" }));
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("addPackingItem stores the section labelId for a contextual add under a label", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [{ id: "label-1", tripId: "trip-1", position: 2 }],
        }),
      })),
      update: vi.fn(() => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await addPackingItem("trip-1", { name: "Visa", afterItemId: "label-1", labelId: "label-1" });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ labelId: "label-1" }));
  });

  it("addPackingItem forces labelId to null for a section label even if one is passed", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ maxPos: 1 }],
      }),
    });
    db.insert.mockReturnValueOnce({ values: insertValues });

    await addPackingItem("trip-1", { name: "Toiletries", isLabel: true, labelId: "label-1" });

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ isLabel: true, labelId: null }));
  });

  it("addPackingItem with beforeItemId inserts before the target to create an ungrouped item", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const shiftWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [{ id: "label-1", tripId: "trip-1", position: 0 }],
        }),
      })),
      update: vi.fn(() => ({
        set: () => ({
          where: shiftWhere,
        }),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await addPackingItem("trip-1", { name: " Travel adapter ", beforeItemId: "label-1" });

    expect(transaction.select).toHaveBeenCalled();
    expect(transaction.update).toHaveBeenCalled();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Travel adapter", position: 0, tripId: "trip-1" })
    );
  });

  it("addPackingItem with afterItemId throws when target item not found", async () => {
    const transaction = {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [],
        }),
      })),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(addPackingItem("trip-1", { name: "Visa", afterItemId: "bad-id" })).rejects.toThrow(
      "Target item not found"
    );
  });

  it("addPackingItem rejects a blank trimmed name", async () => {
    await expect(addPackingItem("trip-1", { name: "   " })).rejects.toThrow("Packing item name is required");

    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("pullTemplatesOntoTrip", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns {added:0,skipped:0} immediately for empty templateIds without DB calls", async () => {
    const result = await pullTemplatesOntoTrip("trip-1", []);

    expect(result).toEqual({ added: 0, skipped: 0 });
    expect(db.select).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("enforces requireUser and assertTripAccess with editor role", async () => {
    const insertValues = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: "new-1" }]) }));
    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
      cb({
        select: vi
          .fn()
          .mockReturnValueOnce({ from: () => ({ where: async () => [{ maxPos: null }] }) })
          .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) }),
        insert: vi.fn(() => ({ values: insertValues })),
      })
    );

    await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("inserts all template items when the trip list is empty", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ maxPos: null }] }) })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                { id: "ti-1", text: "Passport", isLabel: false, position: 0, labelId: null },
                { id: "ti-2", text: "Phone Charger", isLabel: false, position: 1, labelId: null },
              ],
            }),
          }),
        }),
      insert: vi.fn(() => ({ values: insertValues })),
    };

    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) }); // existing items
    db.select.mockReturnValueOnce({
      from: () => ({ where: async () => [{ id: "tmpl-1" }] }),
    }); // owned templates
    db.transaction.mockImplementation(async (cb: (tx: typeof transaction) => Promise<void>) => cb(transaction));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(result).toEqual({ added: 2, skipped: 0 });
    expect(insertValues).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("skips a duplicate when existing item name matches case-insensitively", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ maxPos: 0 }] }) })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [{ id: "ti-1", text: "sunscreen", isLabel: false, position: 0, labelId: null }],
            }),
          }),
        }),
      insert: vi.fn(() => ({ values: insertValues })),
    };

    db.select.mockReturnValueOnce({
      from: () => ({ where: async () => [{ name: "Sunscreen" }] }),
    }); // existing items contain "Sunscreen"
    db.select.mockReturnValueOnce({
      from: () => ({ where: async () => [{ id: "tmpl-1" }] }),
    });
    db.transaction.mockImplementation(async (cb: (tx: typeof transaction) => Promise<void>) => cb(transaction));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(result).toEqual({ added: 0, skipped: 1 });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("deduplicates across two templates sharing an item text", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ maxPos: null }] }) })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [{ id: "ti-1", text: "Toothbrush", isLabel: false, position: 0, labelId: null }],
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [{ id: "ti-2", text: "Toothbrush", isLabel: false, position: 0, labelId: null }],
            }),
          }),
        }),
      insert: vi.fn(() => ({ values: insertValues })),
    };

    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
    db.select.mockReturnValueOnce({
      from: () => ({ where: async () => [{ id: "tmpl-1" }, { id: "tmpl-2" }] }),
    });
    db.transaction.mockImplementation(async (cb: (tx: typeof transaction) => Promise<void>) => cb(transaction));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1", "tmpl-2"]);

    expect(result).toEqual({ added: 1, skipped: 1 });
  });

  it("silently skips a template not owned by the current user", async () => {
    const transaction = {
      select: vi.fn().mockReturnValueOnce({ from: () => ({ where: async () => [{ maxPos: null }] }) }),
      insert: vi.fn(),
    };

    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
    db.select.mockReturnValueOnce({
      from: () => ({ where: async () => [] }),
    }); // no owned templates returned
    db.transaction.mockImplementation(async (cb: (tx: typeof transaction) => Promise<void>) => cb(transaction));

    const result = await pullTemplatesOntoTrip("trip-1", ["foreign-tmpl"]);

    expect(result).toEqual({ added: 0, skipped: 0 });
    expect(transaction.insert).not.toHaveBeenCalled();
  });

  it("appends after the last existing item position", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ maxPos: 3 }] }) })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [{ id: "ti-1", text: "Tent", isLabel: false, position: 0, labelId: null }],
            }),
          }),
        }),
      insert: vi.fn(() => ({ values: insertValues })),
    };

    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ name: "Laptop" }] }) });
    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ id: "tmpl-1" }] }) });
    db.transaction.mockImplementation(async (cb: (tx: typeof transaction) => Promise<void>) => cb(transaction));

    await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ position: 4 }));
  });

  it("maps label cross-references: inserted label id becomes labelId for child items", async () => {
    const labelReturning = vi.fn().mockResolvedValue([{ id: "new-label-id" }]);
    const itemReturning = vi.fn().mockResolvedValue([{ id: "new-item-id" }]);
    let insertCallIndex = 0;
    const insertValues = vi.fn(() => {
      insertCallIndex++;
      return { returning: insertCallIndex === 1 ? labelReturning : itemReturning };
    });
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ maxPos: null }] }) })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                { id: "label-tmpl-id", text: "Toiletries", isLabel: true, position: 0, labelId: null },
                { id: "item-tmpl-id", text: "Toothbrush", isLabel: false, position: 1, labelId: "label-tmpl-id" },
              ],
            }),
          }),
        }),
      insert: vi.fn(() => ({ values: insertValues })),
    };

    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ id: "tmpl-1" }] }) });
    db.transaction.mockImplementation(async (cb: (tx: typeof transaction) => Promise<void>) => cb(transaction));

    await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    // Second insert (Toothbrush) should reference the new label id
    expect(insertValues).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ labelId: "new-label-id", name: "Toothbrush" })
    );
  });

  it("reuses an existing label id when a duplicate template label matches an existing label", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-item-id" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ maxPos: 1 }] }) })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                { id: "label-tmpl-id", text: "Toiletries", isLabel: true, position: 0, labelId: null },
                { id: "item-tmpl-id", text: "Toothbrush", isLabel: false, position: 1, labelId: "label-tmpl-id" },
              ],
            }),
          }),
        }),
      insert: vi.fn(() => ({ values: insertValues })),
    };

    db.select.mockReturnValueOnce({
      from: () => ({ where: async () => [{ name: "Toiletries", id: "existing-label-id", isLabel: true }] }),
    });
    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ id: "tmpl-1" }] }) });
    db.transaction.mockImplementation(async (cb: (tx: typeof transaction) => Promise<void>) => cb(transaction));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(insertValues).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ labelId: "existing-label-id", name: "Toothbrush" })
    );
  });

  it("does not attach children to a non-label row when a duplicate template label matches plain text", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "new-item-id" }]);
    const insertValues = vi.fn(() => ({ returning }));
    const transaction = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: () => ({ where: async () => [{ maxPos: 1 }] }) })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                { id: "label-tmpl-id", text: "Toiletries", isLabel: true, position: 0, labelId: null },
                { id: "item-tmpl-id", text: "Toothbrush", isLabel: false, position: 1, labelId: "label-tmpl-id" },
              ],
            }),
          }),
        }),
      insert: vi.fn(() => ({ values: insertValues })),
    };

    db.select.mockReturnValueOnce({
      from: () => ({ where: async () => [{ name: "Toiletries", id: "existing-item-id", isLabel: false }] }),
    });
    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ id: "tmpl-1" }] }) });
    db.transaction.mockImplementation(async (cb: (tx: typeof transaction) => Promise<void>) => cb(transaction));

    const result = await pullTemplatesOntoTrip("trip-1", ["tmpl-1"]);

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(insertValues).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ labelId: null, name: "Toothbrush" }));
  });
});

describe("retrieveLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token");
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Search Box retrieve response to RetrievedLocation", async () => {
    mockSearchBoxRetrieve.mockResolvedValue({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [139.69, 35.68] },
          properties: {
            name: "Tokyo",
            place_formatted: "Tokyo, Japan",
            full_address: "Tokyo, Tokyo, Japan",
            context: { country: { name: "Japan", country_code: "JP" } },
          },
        },
      ],
    });

    await expect(retrieveLocation("dXJuOm1hcGJveA==", "test-session-token")).resolves.toEqual({
      placeName: "Tokyo, Japan",
      country: "Japan",
      countryCode: "JP",
      center: [139.69, 35.68],
    });
    expect(requireUser).toHaveBeenCalled();
  });

  it("includes place in placeName for neighborhood results", async () => {
    mockSearchBoxRetrieve.mockResolvedValue({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [2.35, 48.86] },
          properties: {
            name: "10th arrondissement",
            place_formatted: "Paris, Île-de-France, France",
            full_address: "10th arrondissement, Paris, Île-de-France, France",
            context: {
              place: { name: "Paris" },
              country: { name: "France", country_code: "FR" },
            },
          },
        },
      ],
    });

    await expect(retrieveLocation("some-id", "sess")).resolves.toEqual({
      placeName: "10th arrondissement, Paris, France",
      country: "France",
      countryCode: "FR",
      center: [2.35, 48.86],
    });
  });

  it("includes the region (state) in placeName", async () => {
    mockSearchBoxRetrieve.mockResolvedValue({
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-111.41, 40.51] },
          properties: {
            name: "Heber City",
            place_formatted: "Utah, United States",
            full_address: "Heber City, Utah, United States",
            context: {
              region: { name: "Utah", region_code: "UT" },
              country: { name: "United States", country_code: "US" },
            },
          },
        },
      ],
    });

    await expect(retrieveLocation("some-id", "sess")).resolves.toEqual({
      placeName: "Heber City, Utah, United States",
      country: "United States",
      countryCode: "US",
      center: [-111.41, 40.51],
    });
  });

  it("returns the E2E stub location when configured", async () => {
    vi.stubEnv("E2E_MAPBOX_STUB", "true");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(retrieveLocation("stub-paris-id", "sess")).resolves.toEqual({
      placeName: "Paris, France",
      country: "France",
      countryCode: "FR",
      center: [2.3488, 48.8534],
    });
    expect(mockSearchBoxRetrieve).not.toHaveBeenCalled();
  });

  it("throws when the Mapbox token is missing", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(retrieveLocation("some-id", "sess")).rejects.toThrow("MAPBOX_ACCESS_TOKEN is not configured");
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("throws when mapboxId is empty", async () => {
    await expect(retrieveLocation("", "sess")).rejects.toThrow("mapboxId is required");
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("throws when no feature is returned", async () => {
    mockSearchBoxRetrieve.mockResolvedValue({ features: [] });

    await expect(retrieveLocation("some-id", "sess")).rejects.toThrow("No feature returned from retrieve");
  });

  it("throws when retrieve network request fails", async () => {
    mockSearchBoxRetrieve.mockRejectedValue(new Error("Network failure"));

    await expect(retrieveLocation("some-id", "sess")).rejects.toThrow("Location retrieve failed: Network failure");
  });
});

describe("searchCoverImages", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
    requireUser.mockResolvedValue({ id: "user-1" });
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
            user: { name: "John Photographer" },
            alt_description: "Tokyo skyline",
            description: null,
          },
        ],
      }),
    });

    await expect(searchCoverImages("Tokyo")).resolves.toEqual([
      {
        id: "abc123",
        url: "https://images.unsplash.com/abc",
        photographer: "John Photographer",
        alt: "Tokyo skyline",
      },
    ]);
    expect(requireUser).toHaveBeenCalled();
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

    await searchCoverImages("Heber City, Utah, United States");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=Heber%20City%2C%20Utah+travel"),
      expect.anything()
    );
  });

  it("leaves 2-part location queries unchanged", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await searchCoverImages("Paris, France");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("query=Paris%2C%20France+travel"),
      expect.anything()
    );
  });

  it("leaves single-part queries unchanged", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

    await searchCoverImages("Tokyo");

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("query=Tokyo+travel"), expect.anything());
  });

  it("throws when Unsplash returns a non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(searchCoverImages("Tokyo")).rejects.toThrow("Unsplash search error: 401");
  });

  it("throws when the Unsplash key is missing", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");

    await expect(searchCoverImages("Tokyo")).rejects.toThrow("UNSPLASH_ACCESS_KEY is not configured");
    expect(requireUser).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when query is empty", async () => {
    await expect(searchCoverImages("")).rejects.toThrow("Search query must not be empty");
    expect(requireUser).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when fetch network request fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    await expect(searchCoverImages("Tokyo")).rejects.toThrow("Unsplash search request failed: Network failure");
  });

  it("throws when response JSON is malformed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    await expect(searchCoverImages("Tokyo")).rejects.toThrow("Unsplash search request failed");
  });

  it("returns empty array when results are empty", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await expect(searchCoverImages("Tokyo")).resolves.toEqual([]);
  });

  it("uses description as fallback when alt_description is null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "xyz",
            urls: { regular: "https://images.unsplash.com/xyz" },
            user: { name: "Jane" },
            alt_description: null,
            description: "A beautiful view",
          },
        ],
      }),
    });

    const result = await searchCoverImages("Paris");
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
            user: { name: "Jane" },
            alt_description: null,
            description: null,
          },
        ],
      }),
    });

    const result = await searchCoverImages("Paris");
    expect(result[0].alt).toBe("");
  });
});

describe("saveTripListAsTemplate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  it("throws 'Template name is required' for empty name", async () => {
    await expect(saveTripListAsTemplate("trip-1", "   ")).rejects.toThrow("Template name is required");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("throws 'Template name must be 100 characters or fewer' for long name", async () => {
    await expect(saveTripListAsTemplate("trip-1", "a".repeat(101))).rejects.toThrow(
      "Template name must be 100 characters or fewer"
    );
  });

  it("enforces requireUser then assertTripAccess with editor role", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: async () => [
            { id: "pi-1", name: "Passport", done: false, isLabel: false, position: 0, labelId: null },
          ],
        }),
      }),
    });
    const insertValues = vi.fn();
    insertValues
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-new" }]) })
      .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "ti-1" }]) });
    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ insert: vi.fn(() => ({ values: insertValues })) })
    );

    await saveTripListAsTemplate("trip-1", "My Template");

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("throws 'Cannot save an empty packing list as a template' for trip with no items", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ orderBy: async () => [] }) }),
    });

    await expect(saveTripListAsTemplate("trip-1", "My Template")).rejects.toThrow(
      "Cannot save an empty packing list as a template"
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("creates template and returns templateId for trip with two plain items", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: async () => [
            { id: "pi-1", name: "Passport", done: false, isLabel: false, position: 0, labelId: null },
            { id: "pi-2", name: "Phone Charger", done: true, isLabel: false, position: 1, labelId: null },
          ],
        }),
      }),
    });
    const insertValues = vi.fn();
    insertValues
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-new" }]) })
      .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "ti-1" }]) });
    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ insert: vi.fn(() => ({ values: insertValues })) })
    );

    const result = await saveTripListAsTemplate("trip-1", "My Template");

    expect(result).toEqual({ templateId: "tmpl-new" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("does not copy done state — template items are always inserted without done field", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: async () => [
            { id: "pi-1", name: "Sunscreen", done: true, isLabel: false, position: 0, labelId: null },
          ],
        }),
      }),
    });
    const insertValues = vi.fn();
    insertValues
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-new" }]) })
      .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "ti-1" }]) });
    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ insert: vi.fn(() => ({ values: insertValues })) })
    );

    await saveTripListAsTemplate("trip-1", "Packed List");

    expect(insertValues).toHaveBeenCalledWith(expect.not.objectContaining({ done: true }));
  });

  it("preserves labelId cross-reference: label items inserted first, non-labels reference new label id", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: async () => [
            { id: "label-old", name: "Toiletries", done: false, isLabel: true, position: 0, labelId: null },
            { id: "item-old", name: "Toothbrush", done: false, isLabel: false, position: 1, labelId: "label-old" },
          ],
        }),
      }),
    });
    const labelReturning = vi.fn().mockResolvedValue([{ id: "label-new" }]);
    const itemReturning = vi.fn().mockResolvedValue([{ id: "item-new" }]);
    const insertValues = vi.fn();
    insertValues
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-new" }]) })
      .mockReturnValueOnce({ returning: labelReturning })
      .mockReturnValue({ returning: itemReturning });
    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ insert: vi.fn(() => ({ values: insertValues })) })
    );

    await saveTripListAsTemplate("trip-1", "With Labels");

    expect(insertValues).toHaveBeenNthCalledWith(2, expect.objectContaining({ isLabel: true, text: "Toiletries" }));
    expect(insertValues).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ isLabel: false, text: "Toothbrush", labelId: "label-new" })
    );
  });

  it("does not write to packingItems — original trip list is read-only", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: async () => [
            { id: "pi-1", name: "Passport", done: false, isLabel: false, position: 0, labelId: null },
          ],
        }),
      }),
    });
    const insertValues = vi.fn();
    insertValues
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-new" }]) })
      .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "ti-1" }]) });
    const insertTx = vi.fn(() => ({ values: insertValues }));
    db.transaction.mockImplementation(async (cb: (tx: { insert: typeof insertTx }) => Promise<void>) =>
      cb({ insert: insertTx })
    );

    await saveTripListAsTemplate("trip-1", "Unchanged Test");

    expect(db.update).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    const txInsertCalls = insertTx.mock.calls as unknown[][];
    const touchedTables = txInsertCalls.map((call) => call[0]);
    expect(touchedTables).not.toContain(packingItems);
    expect(touchedTables).toContain(packingTemplates);
  });

  it("trims whitespace from the template name before saving", async () => {
    db.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: async () => [
            { id: "pi-1", name: "Passport", done: false, isLabel: false, position: 0, labelId: null },
          ],
        }),
      }),
    });
    const insertValues = vi.fn();
    insertValues
      .mockReturnValueOnce({ returning: vi.fn().mockResolvedValue([{ id: "tmpl-new" }]) })
      .mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "ti-1" }]) });
    db.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ insert: vi.fn(() => ({ values: insertValues })) })
    );

    await saveTripListAsTemplate("trip-1", "  Beach Holiday  ");

    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ name: "Beach Holiday" }));
  });
});
