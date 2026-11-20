// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collaborators, days, trips } from "@/db/schema";
import { headers } from "next/headers";

const { recordTripCreated, recordTripUpdated, recordTripInvitation } = vi.hoisted(() => ({
  recordTripInvitation: vi.fn(),
  recordTripCreated: vi.fn(),
  recordTripUpdated: vi.fn(),
}));
vi.mock("@/lib/trip-activity", () => ({ recordTripCreated, recordTripUpdated, recordTripInvitation }));

const { assertWithinRateLimit } = vi.hoisted(() => ({ assertWithinRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ assertWithinRateLimit }));

const { getInvitableUsers } = vi.hoisted(() => ({ getInvitableUsers: vi.fn() }));
vi.mock("@/lib/invitable-users", () => ({ getInvitableUsers }));

const {
  assertTripAccess,
  db,
  publishTripEvent,
  publishUserEvent,
  purgeTripTopic,
  recalculateAll,
  removeTripSubscribersForUser,
  requireUser,
  revalidatePath,
} = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    delete: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
  },
  publishTripEvent: vi.fn(),
  publishUserEvent: vi.fn(),
  purgeTripTopic: vi.fn(),
  recalculateAll: vi.fn(),
  removeTripSubscribersForUser: vi.fn(),
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

const { recordDeletions } = vi.hoisted(() => ({ recordDeletions: vi.fn() }));
vi.mock("@/lib/services/deletion-records", () => ({ recordDeletions }));

vi.mock("@/lib/trip-events", () => ({
  publishTripEvent,
  publishUserEvent,
  purgeTripTopic,
  removeTripSubscribersForUser,
}));

vi.mock("@/lib/currency", () => ({
  recalculateAll,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

const { adapterDel, adapterPut, getStorageAdapter } = vi.hoisted(() => ({
  adapterDel: vi.fn(),
  adapterPut: vi.fn(),
  getStorageAdapter: vi.fn(),
}));

vi.mock("@/lib/storage/storage-adapter", () => ({
  getStorageAdapter,
}));

const { mockSearchBoxSuggest, mockSearchBoxRetrieve } = vi.hoisted(() => ({
  mockSearchBoxSuggest: vi.fn(),
  mockSearchBoxRetrieve: vi.fn(),
}));

const { addPackingItemAction, saveTripListAsTemplateAction } = vi.hoisted(() => ({
  addPackingItemAction: vi.fn(),
  saveTripListAsTemplateAction: vi.fn(),
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

vi.mock("./packing-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./packing-actions")>();

  return {
    ...actual,
    addPackingItem: addPackingItemAction,
    saveTripListAsTemplate: saveTripListAsTemplateAction,
  };
});

import { buildTripDateChangeConfirmation, buildTripDateSyncPlan, resolveTripDateRange } from "./date-sync";
import {
  createTrip,
  deleteTrip,
  retrieveLocation,
  saveTripListAsTemplate,
  searchAddressLocations,
  searchLocations,
} from "./actions";

import { LiveSyncEventType } from "@/data/types";
import { deriveGraphicCover } from "@/lib/utils";
import * as coverSearch from "@/lib/services/cover-search";

describe("manager-gated trip actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "editor-1" });
    assertTripAccess.mockRejectedValue(new Error("not found"));
  });

  it("denies an editor from deleting a trip before any write", async () => {
    await expect(deleteTrip("trip-1")).rejects.toThrow("not found");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "editor-1", "manager");
    expect(db.delete).not.toHaveBeenCalled();
    expect(publishTripEvent).not.toHaveBeenCalled();
  });
});

describe("deleteTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "manager-1" });
    assertTripAccess.mockResolvedValue("manager");
    db.select.mockReturnValue({
      from: () => ({
        where: async () => [],
      }),
    });
    db.delete.mockReturnValue({
      where: async () => {},
    });
  });

  it("publishes trip-deleted and purges the topic after the delete commits, before revalidating", async () => {
    await deleteTrip("trip-1");

    expect(db.delete).toHaveBeenCalledWith(trips);
    expect(publishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.TripDeleted,
      tripId: "trip-1",
    });
    expect(purgeTripTopic).toHaveBeenCalledWith("trip-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");

    const deleteOrder = db.delete.mock.invocationCallOrder[0];
    const publishOrder = publishTripEvent.mock.invocationCallOrder[0];
    const purgeOrder = purgeTripTopic.mock.invocationCallOrder[0];
    const revalidateOrder = revalidatePath.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(publishOrder);
    expect(publishOrder).toBeLessThan(purgeOrder);
    expect(purgeOrder).toBeLessThan(revalidateOrder);
    expect(publishOrder).toBeLessThan(revalidateOrder);
  });

  it("also publishes trip-deleted to each other collaborator's personal channel, but not the acting manager's", async () => {
    db.select.mockReturnValue({
      from: () => ({
        where: async () => [{ userId: "manager-1" }, { userId: "user-editor" }, { userId: null }],
      }),
    });

    await deleteTrip("trip-1");

    expect(publishUserEvent).toHaveBeenCalledExactlyOnceWith("user-editor", {
      type: LiveSyncEventType.TripDeleted,
      tripId: "trip-1",
    });
  });

  it("does not publish or purge when access is denied", async () => {
    assertTripAccess.mockRejectedValue(new Error("not found"));

    await expect(deleteTrip("trip-1")).rejects.toThrow("not found");

    expect(publishTripEvent).not.toHaveBeenCalled();
    expect(purgeTripTopic).not.toHaveBeenCalled();
  });
});

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
        undefined,
        [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-07-04", docCount: 2 }],
        1,
        2,
        2
      )
    ).toEqual({
      removedDates: ["2026-07-04"],
      removedDayLabels: undefined,
      events: [{ id: "event-1", name: "Tea ceremony", displacedDate: "2026-07-04", docCount: 2 }],
      noteCount: 1,
      checklistCount: 2,
      eventDocumentCount: 2,
    });
  });

  it("includes reservations only when some are affected", () => {
    const reservationPreview = { id: "res-1", provider: "Delta", type: "flight" as const, date: "2026-07-04" };
    expect(
      buildTripDateChangeConfirmation(["2026-07-04"], undefined, [], 0, 0, 0, [reservationPreview]).reservations
    ).toEqual([reservationPreview]);
    expect(buildTripDateChangeConfirmation(["2026-07-04"], undefined, [], 0, 0, 0, [])).not.toHaveProperty(
      "reservations"
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
      name: "Test User",
    });
    getStorageAdapter.mockReturnValue({ put: adapterPut, del: adapterDel });
    adapterPut.mockResolvedValue("https://blob.vercel.com/mapbox-covers/trip-1.jpg");
    adapterDel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    db.select.mockReset();
    db.transaction.mockReset();
    db.update.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not record a rolled-back creation", async () => {
    db.transaction.mockRejectedValueOnce(new Error("transaction failed"));
    await expect(createTrip({ name: "Private trip" })).rejects.toThrow("transaction failed");
    expect(recordTripCreated).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: "" }, "Trip name is required."],
    [{ name: "   " }, "Trip name is required."],
    [{ name: "x".repeat(101) }, "Trip name must be 100 characters or fewer."],
    [{ name: "Tokyo", notes: "x".repeat(5001) }, "Notes must be 5000 characters or fewer."],
    [{ name: "Tokyo", destinationName: "x".repeat(201) }, "Destination must be 200 characters or fewer."],
    [{ name: "Tokyo", tags: ["x".repeat(31)] }, "Tag must be 30 characters or fewer."],
    [{ name: "Tokyo", startDate: "2026-99-99" }, "Invalid start date format. Expected YYYY-MM-DD."],
    [{ name: "Tokyo", endDate: "2026-02-30" }, "Invalid end date format. Expected YYYY-MM-DD."],
    [{ name: "Tokyo", budgetTotal: -5 }, "Budget must be 0 or more."],
    [{ name: "Tokyo", budgetTotal: Number.NaN }, "Budget must be a number."],
  ])("rejects invalid input %j before inserting a trip", async (input, message) => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip(input)).rejects.toThrow(message);
    expect(operations.inserts).toHaveLength(0);
  });

  it("rejects unsupported budget currencies before inserting a trip", async () => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip({ name: "Tokyo", budgetCurrency: "zzz" })).rejects.toThrow("Invalid budget currency");
    expect(operations.inserts).toHaveLength(0);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "//evil.example/pixel.png",
    "/api/storage/trip-covers/trip-1/abc.jpg",
  ])("rejects cover URL %j before inserting a trip", async (coverImageUrl) => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip({ name: "Tokyo", coverImageUrl })).rejects.toThrow("Invalid cover image URL.");
    expect(operations.inserts).toHaveLength(0);
  });

  function setupCreateTripDb(
    defaultCoverType: string | null,
    transitMode: string | null = null,
    currency: string | null = "USD"
  ) {
    const operations = {
      inserts: [] as Array<{ table: unknown; values: unknown }>,
      updates: [] as Array<{ table: unknown; values: unknown }>,
    };
    const createdTrip = { id: "trip-1" };
    const transaction = {
      select: () => ({
        from: () => ({
          where: () => ({
            for: async () => [{ id: "user-1", username: "test", name: "Test User", currency, transitMode }],
          }),
        }),
      }),
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
    db.select.mockReturnValueOnce({
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

  it("seeds trip transit mode from the user's global preference when input does not specify one", async () => {
    const operations = setupCreateTripDb(null, "walk");

    await expect(createTrip({ name: "Test" })).resolves.toEqual({ tripId: "trip-1" });
    expect(recordTripCreated).toHaveBeenCalledExactlyOnceWith({ id: "user-1", username: "test" }, "trip-1");

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "walk" }),
    });
  });

  it("defaults to drive when both input and user preference are null", async () => {
    const operations = setupCreateTripDb(null);

    await expect(createTrip({ name: "Test" })).resolves.toEqual({ tripId: "trip-1" });
    expect(recordTripCreated).toHaveBeenCalledExactlyOnceWith({ id: "user-1", username: "test" }, "trip-1");

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "drive" }),
    });
  });

  it("reads transit mode and currency from inside the transaction, not from a pre-transaction snapshot", async () => {
    const lockPreferenceRowSpy = vi.fn(async () => [
      { id: "user-1", username: "test", name: "Test User", currency: "EUR", transitMode: "transit" },
    ]);
    const transactionSelectSpy = vi.fn(() => ({
      from: () => ({
        where: () => ({ for: lockPreferenceRowSpy }),
      }),
    }));
    const createdTrip = { id: "trip-1" };
    const insertedRows: Array<{ table: unknown; values: unknown }> = [];
    const transaction = {
      select: transactionSelectSpy,
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          insertedRows.push({ table, values });
          if (table === trips) {
            return { returning: async () => [createdTrip] };
          }
          return undefined;
        },
      }),
    };
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );
    db.select.mockReturnValueOnce({
      from: () => ({
        where: async () => [{ defaultCoverType: null }],
      }),
    });
    db.update.mockImplementation(() => ({
      set: () => ({
        where: async () => {},
      }),
    }));

    await expect(createTrip({ name: "Test" })).resolves.toEqual({ tripId: "trip-1" });
    expect(recordTripCreated).toHaveBeenCalledExactlyOnceWith({ id: "user-1", username: "test" }, "trip-1");

    expect(transactionSelectSpy).toHaveBeenCalledTimes(1);
    expect(lockPreferenceRowSpy).toHaveBeenCalledWith("update");
    expect(insertedRows).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "transit", budgetCurrency: "EUR" }),
    });
  });

  it("uses input transit mode over the user preference when explicitly provided", async () => {
    const operations = setupCreateTripDb(null, "walk");

    await expect(createTrip({ name: "Test", transitMode: "transit" })).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "transit" }),
    });
  });

  it("falls back to drive when the user's stored transit mode is not a valid TransitMode value", async () => {
    const operations = setupCreateTripDb(null, "bicycle");

    await expect(createTrip({ name: "Test" })).resolves.toEqual({ tripId: "trip-1" });
    expect(recordTripCreated).toHaveBeenCalledExactlyOnceWith({ id: "user-1", username: "test" }, "trip-1");

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({ transitMode: "drive" }),
    });
  });

  it("defaults trip budget currency from the user's preferred currency", async () => {
    const operations = setupCreateTripDb(null);

    await expect(
      createTrip({
        name: "Paris Trip",
        budgetTotal: 1500,
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({
        budgetCurrency: "USD",
        budgetTotal: "1500",
      }),
    });
  });

  it("falls back to locale-derived currency when the user preference is null", async () => {
    vi.mocked(headers).mockResolvedValueOnce(new Headers({ "accept-language": "en-GB,en;q=0.9" }));
    const operations = setupCreateTripDb(null, null, null);

    await expect(
      createTrip({
        name: "London Trip",
        budgetTotal: 200,
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    expect(operations.inserts).toContainEqual({
      table: trips,
      values: expect.objectContaining({
        budgetCurrency: "GBP",
        budgetTotal: "200",
      }),
    });
  });

  it("stores destination fields and applies the first Unsplash cover when the default is photo", async () => {
    const search = vi.spyOn(coverSearch, "searchCoverImages");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
    const operations = setupCreateTripDb(null);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "img-1",
            urls: { regular: "https://images.example/paris.jpg" },
            user: { name: "Photographer", links: { html: "https://unsplash.com/@photographer" } },
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
            role: "manager",
            isCreator: true,
          }),
        },
      ])
    );
    expect(search).toHaveBeenCalledWith({ userId: "user-1" }, "Paris, France");
    expect(assertWithinRateLimit).toHaveBeenCalledWith("unsplashSearch", "user-1");
    search.mockRestore();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: {
          coverImageUrl: "https://images.example/paris.jpg",
          coverPhotographer: "Photographer",
          coverPhotographerUrl: "https://unsplash.com/@photographer",
        },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("applies the first stub photo through the service using its caller actor", async () => {
    vi.stubEnv("E2E_UNSPLASH_STUB", "true");
    const search = vi.spyOn(coverSearch, "searchCoverImages");
    const operations = setupCreateTripDb("photo");
    await expect(createTrip({ name: "Paris", destinationName: "Paris" })).resolves.toEqual({ tripId: "trip-1" });
    expect(search).toHaveBeenCalledWith({ userId: "user-1" }, "Paris");
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: {
          coverImageUrl: expect.stringContaining("data:image/svg+xml"),
          coverPhotographer: "Stub Photographer 1",
          coverPhotographerUrl: "https://unsplash.com/@stub-photographer-1",
        },
      },
    ]);
    expect(assertWithinRateLimit).not.toHaveBeenCalledWith("unsplashSearch", expect.anything());
    expect(mockFetch).not.toHaveBeenCalled();
    search.mockRestore();
  });

  it("fetches the Mapbox static tile server-side and stores the adapter URL when the default is map", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "mapbox-token");
    vi.spyOn(crypto, "randomUUID").mockReturnValue("cover-1234");
    const operations = setupCreateTripDb("map");
    const fakeBlob = new Blob(["png-bytes"], { type: "image/jpeg" });
    mockFetch.mockResolvedValue({ ok: true, blob: async () => fakeBlob });

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
    expect(adapterPut).toHaveBeenCalledWith("trip-covers/trip-1/cover-1234.jpg", expect.any(File));
    expect(operations.updates).toEqual([
      {
        table: trips,
        values: { coverImageUrl: "https://blob.vercel.com/mapbox-covers/trip-1.jpg" },
      },
    ]);
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

    expect(db.select).not.toHaveBeenCalled();
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

    expect(db.select).toHaveBeenCalledOnce();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(operations.updates).toEqual([
      { table: trips, values: { coverImageUrl: deriveGraphicCover("Coordinates Trip") } },
    ]);
  });

  it("inserts exactly one dateless Day 1 when no dates are provided", async () => {
    const operations = setupCreateTripDb(null);

    await expect(
      createTrip({
        name: "No Date Trip",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    const dayInserts = operations.inserts.filter((entry) => entry.table === days);
    expect(dayInserts).toHaveLength(1);
    expect(dayInserts[0].values).toEqual(
      expect.objectContaining({ tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" })
    );
  });

  it("inserts scheduled day rows (not a dateless row) when dates are provided", async () => {
    const operations = setupCreateTripDb(null);

    await expect(
      createTrip({
        name: "Dated Trip",
        startDate: "2026-08-01",
        endDate: "2026-08-02",
      })
    ).resolves.toEqual({ tripId: "trip-1" });

    const dayInserts = operations.inserts.filter((entry) => entry.table === days);
    expect(dayInserts).toHaveLength(1);
    const rows = dayInserts[0].values as Array<{ date: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe("2026-08-01");
    expect(rows[1].date).toBe("2026-08-02");
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

describe("searchAddressLocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token");
    requireUser.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps Search Box suggest results to address lookup suggestions", async () => {
    mockSearchBoxSuggest.mockResolvedValue({
      suggestions: [
        {
          name: "Tokyo Tower",
          full_address: "4 Chome-2-8 Shibakoen, Minato City, Tokyo, Japan",
          mapbox_id: "tokyo-tower-id",
        },
        {
          name: "Paris",
          place_formatted: "Paris, France",
          context: { country: { name: "France", country_code: "FR" } },
          mapbox_id: "paris-id",
        },
      ],
    });

    await expect(searchAddressLocations("Tok", "sess")).resolves.toEqual([
      {
        name: "Tokyo Tower",
        fullAddress: "4 Chome-2-8 Shibakoen, Minato City, Tokyo, Japan",
        mapboxId: "tokyo-tower-id",
      },
      {
        name: "Paris",
        fullAddress: "Paris, France",
        mapboxId: "paris-id",
      },
    ]);
    expect(requireUser).toHaveBeenCalled();
  });

  it("returns the E2E stub lookup suggestion when configured", async () => {
    vi.stubEnv("E2E_MAPBOX_STUB", "true");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(searchAddressLocations("Par", "sess")).resolves.toEqual([
      {
        name: "Paris",
        fullAddress: "Paris, France",
        mapboxId: "stub-paris-id",
        resolvedLocation: {
          name: "Paris",
          fullAddress: "Paris, France",
          placeName: "Paris, France",
          country: "France",
          countryCode: "FR",
          center: [2.3488, 48.8534],
        },
      },
    ]);
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
  });

  it("throws when the query is empty", async () => {
    await expect(searchAddressLocations("  ", "sess")).rejects.toThrow("Search query must not be empty");
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("throws when the Mapbox token is missing", async () => {
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "");

    await expect(searchAddressLocations("Tokyo", "sess")).rejects.toThrow("MAPBOX_ACCESS_TOKEN is not configured");
    expect(requireUser).not.toHaveBeenCalled();
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
      name: "Tokyo",
      fullAddress: "Tokyo, Tokyo, Japan",
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
      name: "10th arrondissement",
      fullAddress: "10th arrondissement, Paris, Île-de-France, France",
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
      name: "Heber City",
      fullAddress: "Heber City, Utah, United States",
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
      name: "Paris",
      fullAddress: "Paris, France",
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

describe("packing action delegation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    addPackingItemAction.mockResolvedValue(undefined);
    saveTripListAsTemplateAction.mockResolvedValue({ templateId: "tmpl-new" });
  });

  it("delegates to packing-actions with the same arguments", async () => {
    await expect(saveTripListAsTemplate("trip-1", "My Template", "idem-1")).resolves.toEqual({
      templateId: "tmpl-new",
    });

    expect(saveTripListAsTemplateAction).toHaveBeenCalledWith("trip-1", "My Template", "idem-1");
  });

  it("allows callers to omit the idempotency key", async () => {
    await expect(saveTripListAsTemplate("trip-1", "Beach Holiday")).resolves.toEqual({
      templateId: "tmpl-new",
    });

    expect(saveTripListAsTemplateAction).toHaveBeenCalledWith("trip-1", "Beach Holiday", undefined);
  });

  it("surfaces delegate failures unchanged", async () => {
    saveTripListAsTemplateAction.mockRejectedValueOnce(new Error("Template name is required"));

    await expect(saveTripListAsTemplate("trip-1", "   ")).rejects.toThrow("Template name is required");
  });
});

describe("Mapbox and Unsplash proxy budgets and caps", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "test-mapbox-token");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-unsplash-key");
    requireUser.mockResolvedValue({ id: "user-1" });
    assertWithinRateLimit.mockImplementation(() => undefined);
    mockSearchBoxSuggest.mockResolvedValue({ suggestions: [] });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const overBudget = () =>
    assertWithinRateLimit.mockImplementation(() => {
      throw new Error("Too many requests. Try again in a moment.");
    });

  it.each([
    ["searchLocations", () => searchLocations("Tokyo", "sess")],
    ["searchAddressLocations", () => searchAddressLocations("Tokyo", "sess")],
    ["retrieveLocation", () => retrieveLocation("mapbox-id", "sess")],
  ])("%s spends the signed-in user's Mapbox search budget before calling Mapbox", async (_name, call) => {
    overBudget();

    await expect(call()).rejects.toThrow("Too many requests");

    expect(assertWithinRateLimit).toHaveBeenCalledWith("mapboxSearch", "user-1");
    expect(mockSearchBoxSuggest).not.toHaveBeenCalled();
    expect(mockSearchBoxRetrieve).not.toHaveBeenCalled();
  });
});
