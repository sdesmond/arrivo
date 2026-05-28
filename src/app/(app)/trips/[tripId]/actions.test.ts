import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertTripAccess,
  mockDbSelect,
  mockDbTransaction,
  mockDbUpdate,
  mockRequireUser,
  mockRevalidatePath,
  mockBlobDel,
  mockBlobPut,
  schemaTokens,
} = vi.hoisted(() => {
  const mockAssertTripAccess = vi.fn();
  const mockDbSelect = vi.fn();
  const mockDbTransaction = vi.fn();
  const mockDbUpdate = vi.fn();
  const mockRequireUser = vi.fn();
  const mockRevalidatePath = vi.fn();
  const mockBlobDel = vi.fn();
  const mockBlobPut = vi.fn();
  const schemaTokens = {
    checklistItems: {},
    days: {},
    documents: {},
    events: {},
    itineraryChecklists: {},
    itineraryNotes: {},
    trips: {},
  };

  return {
    mockAssertTripAccess,
    mockDbSelect,
    mockDbTransaction,
    mockDbUpdate,
    mockRequireUser,
    mockRevalidatePath,
    mockBlobDel,
    mockBlobPut,
    schemaTokens,
  };
});

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
  requireUser: mockRequireUser,
}));

vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    transaction: mockDbTransaction,
    update: mockDbUpdate,
  },
}));

vi.mock("@/db/schema", () => schemaTokens);

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@vercel/blob", () => ({
  del: mockBlobDel,
  put: mockBlobPut,
}));

vi.mock("@/lib/utils", () => ({
  MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
  formatFileSize: vi.fn(),
  inferDocKind: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => "and"),
  asc: vi.fn(() => "asc"),
  eq: vi.fn(() => "eq"),
  gte: vi.fn(() => "gte"),
  inArray: vi.fn(() => "inArray"),
  isNull: vi.fn(() => "isNull"),
  max: vi.fn(() => "max"),
  sql: vi.fn(() => "sql"),
}));

import { reorderDayItems, uploadCoverImage } from "./actions";
import { days, events, itineraryChecklists, itineraryNotes, trips } from "@/db/schema";

interface ReorderTransactionFixture {
  currentChecklists?: Array<{ id: string }>;
  currentEvents?: Array<{ id: string }>;
  currentNotes?: Array<{ id: string }>;
}

function createReorderTransactionMock({
  currentChecklists = [],
  currentEvents = [],
  currentNotes = [],
}: ReorderTransactionFixture) {
  const updates: Array<{ position: number; table: unknown }> = [];

  const transaction = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(async () => {
          if (table === events) return currentEvents;
          if (table === itineraryNotes) return currentNotes;
          if (table === itineraryChecklists) return currentChecklists;
          throw new Error("Unexpected table read.");
        }),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: ({ position }: { position: number }) => ({
        where: vi.fn(async () => {
          updates.push({ position, table });
        }),
      }),
    })),
  };

  return { transaction, updates };
}

describe("reorderDayItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue({
      from: vi.fn((table: unknown) => {
        if (table !== days) {
          throw new Error("Unexpected table read.");
        }

        return {
          where: vi.fn(async () => [{ tripId: "trip-1" }]),
        };
      }),
    });
  });

  it("updates positions when the submitted item set still matches the live day contents", async () => {
    const { transaction, updates } = createReorderTransactionMock({
      currentChecklists: [{ id: "checklist-1" }],
      currentEvents: [{ id: "event-1" }],
      currentNotes: [{ id: "note-1" }],
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await reorderDayItems({
      dayId: "day-1",
      orderedItems: [
        { type: "note", id: "note-1" },
        { type: "event", id: "event-1" },
        { type: "checklist", id: "checklist-1" },
      ],
    });

    expect(updates).toEqual([
      { position: 0, table: itineraryNotes },
      { position: 1, table: events },
      { position: 2, table: itineraryChecklists },
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("rejects stale reorder payloads before applying any writes", async () => {
    const { transaction, updates } = createReorderTransactionMock({
      currentChecklists: [{ id: "checklist-1" }],
      currentEvents: [{ id: "event-1" }],
      currentNotes: [{ id: "note-1" }],
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await expect(
      reorderDayItems({
        dayId: "day-1",
        orderedItems: [
          { type: "note", id: "note-1" },
          { type: "event", id: "event-1" },
        ],
      })
    ).rejects.toThrow("CONCURRENT_MODIFICATION");

    expect(updates).toEqual([]);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("uploadCoverImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockBlobDel.mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: null }]),
        })),
      })),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    });
  });

  it("rejects non-image files before uploading", async () => {
    const formData = new FormData();
    formData.append("file", new File(["pdf"], "notes.pdf", { type: "application/pdf" }));

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow("Cover image must be an image");

    expect(mockBlobPut).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("rejects oversized image files before uploading", async () => {
    const oversized = new File(["img"], "cover.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: 25 * 1024 * 1024 + 1 });
    const formData = new FormData();
    formData.append("file", oversized);

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow("Cover image exceeds 25 MB limit");

    expect(mockBlobPut).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("cleans up an uploaded blob when the trip update fails", async () => {
    const formData = new FormData();
    formData.append("file", new File(["img"], "cover.png", { type: "image/png" }));
    mockBlobPut.mockResolvedValue({ url: "https://blob.vercel.dev/cover.png" });
    mockDbUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          throw new Error("db failed");
        }),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow("db failed");

    expect(mockBlobPut).toHaveBeenCalledWith("cover.png", expect.any(File), { access: "public" });
    expect(mockBlobDel).toHaveBeenCalledWith("https://blob.vercel.dev/cover.png");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("updates the trip cover and revalidates on success", async () => {
    const formData = new FormData();
    formData.append("file", new File(["img"], "cover.png", { type: "image/png" }));
    mockBlobPut.mockResolvedValue({ url: "https://blob.vercel.dev/cover.png" });

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/cover.png");

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(mockDbUpdate).toHaveBeenCalledWith(trips);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("cleans up the previous blob when replacing a cover image", async () => {
    const formData = new FormData();
    formData.append("file", new File(["img"], "new-cover.png", { type: "image/png" }));
    mockBlobPut.mockResolvedValue({ url: "https://blob.vercel.dev/new-cover.png" });
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: "https://blob.vercel.dev/old-cover.png" }]),
        })),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/new-cover.png");

    expect(mockBlobDel).toHaveBeenCalledWith("https://blob.vercel.dev/old-cover.png");
  });

  it("does not delete the previous cover when it is a placeholder", async () => {
    const formData = new FormData();
    formData.append("file", new File(["img"], "new-cover.png", { type: "image/png" }));
    mockBlobPut.mockResolvedValue({ url: "https://blob.vercel.dev/new-cover.png" });
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: "https://placehold.co/600x400/png?text=Old" }]),
        })),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/new-cover.png");

    expect(mockBlobDel).not.toHaveBeenCalled();
  });
});
