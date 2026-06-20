// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, put, del, requireUser, revalidatePath, saveLocalUpload, tripsTable } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
  put: vi.fn(),
  del: vi.fn(),
  requireUser: vi.fn(),
  revalidatePath: vi.fn(),
  saveLocalUpload: vi.fn(),
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

vi.mock("@vercel/blob", () => ({
  del,
  put,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

vi.mock("@/lib/local-upload", () => ({
  isBlobUploadUrl: (url: string) => url.startsWith("https://blob.vercel."),
  saveLocalUpload,
}));

import { uploadCoverImage } from "./cover-upload-actions";

function makeFile(name: string, type: string, size = 100): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

describe("uploadCoverImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    put.mockResolvedValue({ url: "https://blob.vercel.dev/new-cover.png" });
    del.mockResolvedValue(undefined);
    saveLocalUpload.mockResolvedValue("/uploads/trip-covers/trip-1/upload-1234.png");
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

    expect(put).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("uses a generated Blob storage name", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    const file = makeFile("cover.png", "image/png");
    const formData = new FormData();
    formData.append("file", file);

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("https://blob.vercel.dev/new-cover.png");

    expect(put).toHaveBeenCalledWith("trip-covers/trip-1/upload-1234.png", file, { access: "public" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("uses the generated storage name for local stub uploads too", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("upload-1234");
    vi.stubEnv("UPLOAD_STUB", "true");
    const file = makeFile("cover.png", "image/png");
    const formData = new FormData();
    formData.append("file", file);

    await expect(uploadCoverImage("trip-1", formData)).resolves.toBe("/uploads/trip-covers/trip-1/upload-1234.png");

    expect(saveLocalUpload).toHaveBeenCalledWith(file, { storageName: "trip-covers/trip-1/upload-1234.png" });
    expect(put).not.toHaveBeenCalled();
  });

  it("rolls back the uploaded blob when the trip update fails", async () => {
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

    expect(del).toHaveBeenCalledWith("https://blob.vercel.dev/new-cover.png");
  });
});
