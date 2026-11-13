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
  dismissShareInvitation,
  getShareDialogData,
  uploadCoverImage,
  rescindShareInvitation,
  resendShareInvitation,
  saveContributorChanges,
} from "./actions";
import { trips } from "@/db/schema";
import { type ContributorChange } from "@/data/types";

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
