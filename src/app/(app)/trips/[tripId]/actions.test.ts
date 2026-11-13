// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordTripUpdated } = vi.hoisted(() => ({ recordTripUpdated: vi.fn() }));
vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));

const { assertUploadContentMatchesType } = vi.hoisted(() => ({
  assertUploadContentMatchesType: vi.fn(async () => undefined),
}));
vi.mock("@/lib/upload-policy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload-policy")>()),
  assertUploadContentMatchesType,
}));

const {
  mockAssertTripAccess,
  mockDbInsert,
  mockDbSelect,
  mockDbTransaction,
  mockDbUpdate,
  mockDbExecute,
  mockDbDelete,
  mockRequireUser,
  mockRevalidatePath,
  mockAdapterDel,
  mockAdapterPut,
  mockDeriveGraphicCover,
  mockDismissInvitation,
  mockGetContributorsAndInvitations,
  mockGetStorageAdapter,
  mockPublishTripEvent,
  mockRescindInvitation,
  mockResendInvitation,
  mockSaveContributorChanges,
  schemaTokens,
} = vi.hoisted(() => {
  const mockAssertTripAccess = vi.fn();
  const mockDbSelect = vi.fn();
  const mockDbInsert = vi.fn();
  const mockDbTransaction = vi.fn();
  const mockDbUpdate = vi.fn();
  const mockDbExecute = vi.fn();
  const mockDbDelete = vi.fn();
  const mockRequireUser = vi.fn();
  const mockRevalidatePath = vi.fn();
  const mockAdapterDel = vi.fn();
  const mockAdapterPut = vi.fn();
  const mockDeriveGraphicCover = vi.fn((title: string) => `graphic:${title}`);
  const mockDismissInvitation = vi.fn();
  const mockGetContributorsAndInvitations = vi.fn();
  const mockGetStorageAdapter = vi.fn();
  const mockPublishTripEvent = vi.fn();
  const mockRescindInvitation = vi.fn();
  const mockResendInvitation = vi.fn();
  const mockSaveContributorChanges = vi.fn();
  const schemaTokens: Record<string, unknown> = {
    days: {},
    documents: {},
    events: {},
    itineraryChecklists: {},
    itineraryNotes: {},
    packingItems: {},
    packingTemplateItems: {},
    packingTemplates: {},
    trips: {},
    tripPackingLists: {},
  };

  return {
    mockAssertTripAccess,
    mockDbSelect,
    mockDbInsert,
    mockDbTransaction,
    mockDbUpdate,
    mockDbExecute,
    mockDbDelete,
    mockRequireUser,
    mockRevalidatePath,
    mockAdapterDel,
    mockAdapterPut,
    mockDeriveGraphicCover,
    mockDismissInvitation,
    mockGetContributorsAndInvitations,
    mockGetStorageAdapter,
    mockPublishTripEvent,
    mockRescindInvitation,
    mockResendInvitation,
    mockSaveContributorChanges,
    schemaTokens,
  };
});

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
  requireUser: mockRequireUser,
}));

vi.mock("@/db", () => ({
  db: {
    execute: mockDbExecute,
    delete: mockDbDelete,
    insert: mockDbInsert,
    select: mockDbSelect,
    transaction: mockDbTransaction,
    update: mockDbUpdate,
  },
}));

vi.mock("@/db/schema", () => schemaTokens);

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/storage/storage-adapter", () => ({
  getStorageAdapter: mockGetStorageAdapter,
}));

vi.mock("@/lib/invitations", () => ({
  resendInvitation: mockResendInvitation,
}));

vi.mock("@/lib/queries", () => ({
  getContributorsAndInvitations: mockGetContributorsAndInvitations,
}));

vi.mock("@/lib/trip-events", () => ({
  publishTripEvent: mockPublishTripEvent,
}));

vi.mock("../actions", () => ({
  dismissInvitation: mockDismissInvitation,
  rescindInvitation: mockRescindInvitation,
  saveContributorChanges: mockSaveContributorChanges,
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils")>();
  return {
    GRAPHIC_COVER_COLORS: actual.GRAPHIC_COVER_COLORS,
    GRAPHIC_COVER_ICONS: actual.GRAPHIC_COVER_ICONS,
    GRAPHIC_COVER_PATTERNS: actual.GRAPHIC_COVER_PATTERNS,
    parseGraphicCover: actual.parseGraphicCover,
    MAX_COVER_IMAGE_UPLOAD_BYTES: 12 * 1024 * 1024,
    MAX_UPLOAD_BYTES: 25 * 1024 * 1024,
    deriveGraphicCover: mockDeriveGraphicCover,
    formatFileSize: vi.fn(),
    inferDocKind: vi.fn(),
  };
});

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

import {
  attachTripDocToEvent,
  dismissShareInvitation,
  getShareDialogData,
  promoteEventDocToTrip,
  removeTripCover,
  setTripCoverWithAttribution,
  uploadCoverImage,
  rescindShareInvitation,
  resendShareInvitation,
  saveContributorChanges,
} from "./actions";
import { trips } from "@/db/schema";
import { LiveSyncEventType, type ContributorChange } from "@/data/types";

function createSimpleSelect(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(async () => rows),
    })),
  };
}

beforeEach(() => {
  mockGetStorageAdapter.mockReturnValue({ put: mockAdapterPut, del: mockAdapterDel });
  mockAdapterDel.mockResolvedValue(undefined);
});

describe("share invitation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "manager-1" });
    mockResendInvitation.mockResolvedValue({ status: "success", expiresAt: "2026-09-04T12:00:00.000Z" });
    mockRescindInvitation.mockResolvedValue({ status: "success" });
    mockDismissInvitation.mockResolvedValue({ status: "success" });
    mockSaveContributorChanges.mockResolvedValue({ status: "success" });
    mockGetContributorsAndInvitations.mockResolvedValue({
      collaborators: [],
      currentCollaboratorId: "manager-row-1",
      invitations: [],
    });
  });

  it("delegates to getContributorsAndInvitations with the caller's id", async () => {
    await expect(getShareDialogData("trip-1")).resolves.toEqual({
      collaborators: [],
      currentCollaboratorId: "manager-row-1",
      invitations: [],
    });

    expect(mockGetContributorsAndInvitations).toHaveBeenCalledWith("trip-1", "manager-1");
  });

  it("propagates a rejection from getContributorsAndInvitations", async () => {
    mockGetContributorsAndInvitations.mockRejectedValue(new Error("not found"));

    await expect(getShareDialogData("trip-1")).rejects.toThrow("not found");
  });

  it("delegates a resend before revalidating the trip", async () => {
    await expect(resendShareInvitation("trip-1", "invite-1")).resolves.toEqual({
      status: "success",
      expiresAt: "2026-09-04T12:00:00.000Z",
    });

    expect(mockResendInvitation).toHaveBeenCalledWith("invite-1", "trip-1", "manager-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("delegates a rescind before revalidating the trip", async () => {
    await expect(rescindShareInvitation("trip-1", "invite-1")).resolves.toEqual({ status: "success" });

    expect(mockRescindInvitation).toHaveBeenCalledWith("trip-1", "invite-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("delegates a dismissal and revalidates the trip after success", async () => {
    await expect(dismissShareInvitation("trip-1", "invite-1")).resolves.toEqual({ status: "success" });

    expect(mockDismissInvitation).toHaveBeenCalledWith("trip-1", "invite-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("does not revalidate when a dismissal result is rejected", async () => {
    mockDismissInvitation.mockResolvedValue({ status: "error", message: "Invitation is still pending." });

    await expect(dismissShareInvitation("trip-1", "invite-1")).resolves.toEqual({
      status: "error",
      message: "Invitation is still pending.",
    });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("propagates a rejection from underlying share invitation actions without revalidating", async () => {
    mockResendInvitation.mockRejectedValue(new Error("not found"));
    mockRescindInvitation.mockRejectedValue(new Error("not found"));
    mockDismissInvitation.mockRejectedValue(new Error("not found"));

    await expect(resendShareInvitation("trip-1", "invite-1")).rejects.toThrow("not found");
    await expect(rescindShareInvitation("trip-1", "invite-1")).rejects.toThrow("not found");
    await expect(dismissShareInvitation("trip-1", "invite-1")).rejects.toThrow("not found");

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("delegates saveContributorChanges and revalidates the detail route on success", async () => {
    const changes: ContributorChange[] = [
      { type: "role", collaboratorId: "collab-1", fromRole: "editor", toRole: "viewer" },
      { type: "remove", collaboratorId: "collab-2" },
    ];

    await expect(saveContributorChanges("trip-1", changes)).resolves.toEqual({ status: "success" });

    expect(mockSaveContributorChanges).toHaveBeenCalledWith("trip-1", changes);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("does not revalidate when a saveContributorChanges batch is rejected", async () => {
    mockSaveContributorChanges.mockResolvedValue({ status: "error", message: "Batch rejected." });

    await expect(saveContributorChanges("trip-1", [{ type: "remove", collaboratorId: "collab-1" }])).resolves.toEqual({
      status: "error",
      message: "Batch rejected.",
    });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("uploadCoverImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockAdapterPut.mockResolvedValue("https://blob.vercel.dev/cover.png");
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

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow(
      "Unsupported cover image type. Choose JPG, PNG, WEBP, HEIC, GIF, or AVIF."
    );

    expect(mockAdapterPut).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("rejects oversized image files before uploading", async () => {
    const oversized = new File(["img"], "cover.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: 12 * 1024 * 1024 + 1 });
    const formData = new FormData();
    formData.append("file", oversized);

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow("Cover image exceeds 12 MB limit");

    expect(mockAdapterPut).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("cleans up an uploaded file when the trip update fails", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", new File(["img"], "cover.png", { type: "image/png" }));
    mockDbUpdate.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          throw new Error("db failed");
        }),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow("db failed");

    expect(mockAdapterPut).toHaveBeenCalledWith("trip-covers/trip-1/upload-1234.png", expect.any(File));
    expect(mockAdapterDel).toHaveBeenCalledWith("https://blob.vercel.dev/cover.png");
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("updates the trip cover and revalidates on success", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", new File(["img"], "cover.png", { type: "image/png" }));

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/cover.png");

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(mockDbUpdate).toHaveBeenCalledWith(trips);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("cleans up the previous cover unconditionally when replacing a cover image", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", new File(["img"], "new-cover.png", { type: "image/png" }));
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: "https://blob.vercel.dev/old-cover.png" }]),
        })),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/cover.png");

    expect(mockAdapterDel).toHaveBeenCalledWith("https://blob.vercel.dev/old-cover.png");
  });

  it("deletes the previous cover even when it is an external url (adapter no-ops)", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", new File(["img"], "new-cover.png", { type: "image/png" }));
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: "https://images.example.com/old-cover.png" }]),
        })),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/cover.png");

    expect(mockAdapterDel).toHaveBeenCalledWith("https://images.example.com/old-cover.png");
  });
});

describe("setTripCoverWithAttribution", () => {
  const mockWhere = vi.fn();
  const mockSet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockWhere });
    mockDbUpdate.mockReturnValue({
      set: mockSet,
    });
  });

  it("persists cover url and attribution fields", async () => {
    await setTripCoverWithAttribution(
      "trip-1",
      "https://images.example.com/cover.jpg",
      "Jane Lens",
      "https://unsplash.com/@janelens"
    );

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(mockDbUpdate).toHaveBeenCalledWith(trips);
    expect(mockSet).toHaveBeenCalledWith({
      coverImageUrl: "https://images.example.com/cover.jpg",
      coverPhotographer: "Jane Lens",
      coverPhotographerUrl: "https://unsplash.com/@janelens",
    });
    expect(mockPublishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.ItineraryChanged,
      tripId: "trip-1",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("records nothing when access is denied", async () => {
    mockAssertTripAccess.mockRejectedValueOnce(new Error("denied"));

    await expect(setTripCoverWithAttribution("trip-1", "graphic:x")).rejects.toThrow("denied");

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("clears attribution when photographer fields are null", async () => {
    await setTripCoverWithAttribution("trip-1", "graphic:var(--color-indigo-400)/dots/plane", null, null);

    expect(mockSet).toHaveBeenCalledWith({
      coverImageUrl: "graphic:var(--color-indigo-400)/dots/plane",
      coverPhotographer: null,
      coverPhotographerUrl: null,
    });
  });

  it("accepts a cover uploaded for the same trip", async () => {
    await setTripCoverWithAttribution("trip-1", "/api/storage/trip-covers/trip-1/abc.jpg");

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ coverImageUrl: "/api/storage/trip-covers/trip-1/abc.jpg" })
    );
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "//evil.example/pixel.png",
    "/api/storage/../../etc/passwd",
    "/api/storage/trip-covers/other-trip/abc.jpg",
    "/api/storage/trip-documents/trip-1/passport.pdf",
  ])("rejects cover URL %j without writing", async (coverImageUrl) => {
    await expect(setTripCoverWithAttribution("trip-1", coverImageUrl)).rejects.toThrow("Invalid cover image URL.");

    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "//evil.example", "data:text/html,x"])(
    "rejects photographer URL %j without writing",
    async (photographerUrl) => {
      await expect(
        setTripCoverWithAttribution("trip-1", "https://images.example.com/cover.jpg", "Jane", photographerUrl)
      ).rejects.toThrow("Invalid photographer URL.");

      expect(mockDbUpdate).not.toHaveBeenCalled();
    }
  );
});

describe("removeTripCover", () => {
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  let transactionExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    transactionExecute = vi.fn().mockResolvedValue([{ id: "trip-1" }]);
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ name: "Summer Trip" }]),
        })),
      })),
    });
    mockWhere.mockResolvedValue(undefined);
    mockSet.mockReturnValue({ where: mockWhere });
    mockDbUpdate.mockReturnValue({
      set: mockSet,
    });
    mockDbTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) =>
      callback({ execute: transactionExecute, select: mockDbSelect, update: mockDbUpdate })
    );
  });

  it("replaces the cover with a derived graphic and clears attribution", async () => {
    await removeTripCover("trip-1");

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(transactionExecute).toHaveBeenCalledOnce();
    expect(mockDeriveGraphicCover).toHaveBeenCalledWith("Summer Trip");
    expect(mockSet).toHaveBeenCalledWith({
      coverImageUrl: "graphic:Summer Trip",
      coverPhotographer: null,
      coverPhotographerUrl: null,
    });
    expect(mockPublishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.ItineraryChanged,
      tripId: "trip-1",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("throws when the trip no longer exists", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    });

    await expect(removeTripCover("trip-1")).rejects.toThrow("Trip not found");

    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });
});

describe("attachTripDocToEvent scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
    mockDbSelect.mockReturnValue(createSimpleSelect([{ tripId: "trip-1" }]));
  });

  it("rejects a document that is not in the event's trip", async () => {
    const whereSpy = vi.fn(() => ({ returning: vi.fn(async () => []) }));
    mockDbUpdate.mockReturnValue({ set: vi.fn(() => ({ where: whereSpy })) });

    await expect(attachTripDocToEvent("other-trip-doc", "event-1")).rejects.toThrow("Document not found.");

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(mockPublishTripEvent).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("publishItineraryChanged regression coverage", () => {
  // These actions each end by publishing ItineraryChanged for their trip. Rather than a bespoke
  // describe block per action duplicating the same assert-and-mock boilerplate, this table drives
  // one generic test body per action-under-test; see epic-4-retro-2026-09-08.md item 19.
  interface PublishCase {
    name: string;
    tripId: string;
    run: () => Promise<unknown>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  const cases: PublishCase[] = [
    {
      name: "attachTripDocToEvent",
      tripId: "trip-1",
      run: () => {
        mockDbSelect.mockReturnValue(createSimpleSelect([{ tripId: "trip-1" }]));
        mockDbUpdate.mockReturnValue({
          set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "doc-1" }]) })) })),
        });
        return attachTripDocToEvent("doc-1", "event-1");
      },
    },
    {
      name: "promoteEventDocToTrip",
      tripId: "trip-1",
      run: () => {
        mockDbSelect.mockReturnValue(createSimpleSelect([{ id: "doc-1", tripId: "trip-1", eventId: "event-1" }]));
        mockDbUpdate.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) });
        return promoteEventDocToTrip("doc-1");
      },
    },
  ];

  it.each(cases)("publishes ItineraryChanged for $name", async ({ tripId, run }) => {
    await run();

    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", tripId);
    expect(mockPublishTripEvent).toHaveBeenCalledWith(tripId, {
      type: LiveSyncEventType.ItineraryChanged,
      tripId,
    });
  });
});
