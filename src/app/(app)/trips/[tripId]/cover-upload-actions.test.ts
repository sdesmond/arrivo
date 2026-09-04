// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adapterDel,
  adapterPut,
  assertTripAccess,
  db,
  getStorageAdapter,
  publishTripEvent,
  requireUser,
  revalidatePath,
  tripsTable,
} = vi.hoisted(() => ({
  adapterDel: vi.fn(),
  adapterPut: vi.fn(),
  assertTripAccess: vi.fn(),
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
  getStorageAdapter: vi.fn(),
  publishTripEvent: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  tripsTable: { coverImageUrl: "trips.coverImageUrl", id: "trips.id" },
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("@/db/schema", () => ({
  trips: tripsTable,
}));

vi.mock("@/lib/storage/storage-adapter", () => ({
  getStorageAdapter,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/trip-events", () => ({
  publishTripEvent,
}));

import { uploadCoverImage } from "./cover-upload-actions";
import { LiveSyncEventType } from "@/data/types";

function makeFile(name: string, type: string, size = 100): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

describe("uploadCoverImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    getStorageAdapter.mockReturnValue({ put: adapterPut, del: adapterDel });
    adapterPut.mockResolvedValue("https://blob.vercel.dev/new-cover.png");
    adapterDel.mockResolvedValue(undefined);
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: null }]),
        })),
      })),
    });
    db.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    });
  });

  it("rejects unsupported cover MIME types before uploading", async () => {
    const formData = new FormData();
    formData.append("file", makeFile("cover.svg", "image/svg+xml"));

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow(
      "Unsupported cover image type. Choose JPG, PNG, WEBP, HEIC, GIF, or AVIF."
    );

    expect(adapterPut).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("uses a generated storage name", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const file = makeFile("cover.png", "image/png");
    const formData = new FormData();
    formData.append("file", file);

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/new-cover.png");

    expect(adapterPut).toHaveBeenCalledWith("trip-covers/trip-1/upload-1234.png", file);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
    expect(publishTripEvent).toHaveBeenCalledWith("trip-1", {
      type: LiveSyncEventType.ItineraryChanged,
      tripId: "trip-1",
    });
  });

  it("rolls back the uploaded file when the trip update fails", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const file = makeFile("cover.png", "image/png");
    const formData = new FormData();
    formData.append("file", file);
    db.update.mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          throw new Error("db failed");
        }),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).rejects.toThrow("db failed");

    expect(adapterDel).toHaveBeenCalledWith("https://blob.vercel.dev/new-cover.png");
  });

  it("deletes the previous cover unconditionally, including legacy blob URLs", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", makeFile("new-cover.png", "image/png"));
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: "https://blob.vercel.dev/old-cover.png" }]),
        })),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/new-cover.png");

    expect(adapterDel).toHaveBeenCalledWith("https://blob.vercel.dev/old-cover.png");
  });

  it("deletes the previous cover even when it is an external URL (adapter no-ops)", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", makeFile("new-cover.png", "image/png"));
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: "https://images.example.com/old-cover.png" }]),
        })),
      })),
    });

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/new-cover.png");

    expect(adapterDel).toHaveBeenCalledWith("https://images.example.com/old-cover.png");
  });

  it("skips previous-cover cleanup when there is no previous cover", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", makeFile("cover.png", "image/png"));

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/new-cover.png");

    expect(adapterDel).not.toHaveBeenCalled();
  });

  it("still succeeds when deleting the previous cover rejects (no rollback of the new upload)", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const formData = new FormData();
    formData.append("file", makeFile("new-cover.png", "image/png"));
    db.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ coverImageUrl: "https://blob.vercel.dev/old-cover.png" }]),
        })),
      })),
    });
    adapterDel.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/new-cover.png");

    expect(adapterDel).toHaveBeenCalledWith("https://blob.vercel.dev/old-cover.png");
    expect(adapterDel).toHaveBeenCalledTimes(1);
  });
});
