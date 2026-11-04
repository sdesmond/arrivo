// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, selectLimit, updateWhere, updateSet, update, put, del, revalidatePath, processAvatarImage } =
  vi.hoisted(() => {
    const selectLimit = vi.fn();
    const updateWhere = vi.fn();
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    return {
      requireUser: vi.fn(),
      selectLimit,
      updateWhere,
      updateSet,
      update: vi.fn(() => ({ set: updateSet })),
      put: vi.fn(),
      del: vi.fn(),
      revalidatePath: vi.fn(),
      processAvatarImage: vi.fn(),
    };
  });

vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: selectLimit }) }) }), update },
}));
vi.mock("@/db/schema", () => ({ users: { id: "users.id", image: "users.image" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn((_column: unknown, value: unknown) => ["eq", value]) }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ put, del }) }));
vi.mock("@/lib/avatar-image", async () => {
  const actual = await vi.importActual<typeof import("@/lib/avatar-image")>("@/lib/avatar-image");
  return { ...actual, processAvatarImage };
});

import { AvatarImageError } from "@/lib/avatar-image";
import { removeAvatar, uploadAvatar } from "./avatar-actions";

const OLD_URL = "/api/storage/user-avatars/user-1/old.webp";
const NEW_URL = "/api/storage/user-avatars/user-1/new.webp";

function formWith(file?: File): FormData {
  const formData = new FormData();
  if (file) formData.set("file", file);
  return formData;
}

function pngFile(size = 10): File {
  const file = new File(["x"], "me.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("uploadAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    selectLimit.mockResolvedValue([{ image: null }]);
    updateWhere.mockResolvedValue(undefined);
    put.mockResolvedValue(NEW_URL);
    del.mockResolvedValue(undefined);
    processAvatarImage.mockResolvedValue(Buffer.from("webp-bytes"));
  });

  it("re-encodes, stores under the caller's avatar prefix, and saves the URL on the caller's row", async () => {
    const result = await uploadAvatar(formWith(pngFile()));

    expect(result).toEqual({ ok: true, image: NEW_URL });
    expect(requireUser).toHaveBeenCalled();
    expect(processAvatarImage).toHaveBeenCalledWith(expect.any(Buffer));
    const [storageName, stored] = put.mock.calls[0] as [string, File];
    expect(storageName).toMatch(/^user-avatars\/user-1\/[0-9a-f-]+\.webp$/);
    expect(stored.type).toBe("image/webp");
    expect(Buffer.from(await stored.arrayBuffer()).toString()).toBe("webp-bytes");
    expect(updateSet).toHaveBeenCalledWith({ image: NEW_URL });
    expect(updateWhere).toHaveBeenCalledWith(["eq", "user-1"]);
    expect(del).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("removes the previous file after the new one is saved", async () => {
    selectLimit.mockResolvedValue([{ image: OLD_URL }]);

    await uploadAvatar(formWith(pngFile()));

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(OLD_URL);
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0]);
    expect(updateWhere.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0]);
  });

  it("logs, not throws, when the previous file cannot be deleted", async () => {
    selectLimit.mockResolvedValue([{ image: OLD_URL }]);
    del.mockRejectedValue(new Error("disk"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(uploadAvatar(formWith(pngFile()))).resolves.toEqual({ ok: true, image: NEW_URL });

    expect(warn).toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("deletes the new file and rethrows when the DB write fails", async () => {
    selectLimit.mockResolvedValue([{ image: OLD_URL }]);
    updateWhere.mockRejectedValue(new Error("db down"));

    await expect(uploadAvatar(formWith(pngFile()))).rejects.toThrow("db down");

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(NEW_URL);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("still rethrows the DB error when rollback cleanup also fails", async () => {
    updateWhere.mockRejectedValue(new Error("db down"));
    del.mockRejectedValue(new Error("disk"));

    await expect(uploadAvatar(formWith(pngFile()))).rejects.toThrow("db down");
  });

  it("stores nothing when the storage write itself fails", async () => {
    put.mockRejectedValue(new Error("disk full"));

    await expect(uploadAvatar(formWith(pngFile()))).rejects.toThrow("disk full");

    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("rejects a wrong file type without storing or touching the row", async () => {
    const result = await uploadAvatar(formWith(new File(["x"], "me.gif", { type: "image/gif" })));

    expect(result).toEqual({ ok: false, error: "Unsupported photo type. Choose JPG, PNG, or WEBP." });
    expect(processAvatarImage).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a file over 5 MB without storing or touching the row", async () => {
    const result = await uploadAvatar(formWith(pngFile(5 * 1024 * 1024 + 1)));

    expect(result).toEqual({ ok: false, error: "Photo is too large. Max 5 MB." });
    expect(put).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("reports an undecodable image without storing or touching the row", async () => {
    processAvatarImage.mockRejectedValue(new AvatarImageError());

    const result = await uploadAvatar(formWith(pngFile()));

    expect(result).toEqual({ ok: false, error: "Couldn't read that image" });
    expect(put).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("propagates unexpected processing errors", async () => {
    processAvatarImage.mockRejectedValue(new Error("sharp crashed"));

    await expect(uploadAvatar(formWith(pngFile()))).rejects.toThrow("sharp crashed");
  });

  it("reports a missing file", async () => {
    await expect(uploadAvatar(formWith())).resolves.toEqual({ ok: false, error: "Choose a photo to upload." });
    expect(put).not.toHaveBeenCalled();
  });

  it("does nothing for a signed-out caller", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(uploadAvatar(formWith(pngFile()))).rejects.toThrow("NEXT_REDIRECT");

    expect(put).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("removeAvatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    selectLimit.mockResolvedValue([{ image: OLD_URL }]);
    updateWhere.mockResolvedValue(undefined);
    del.mockResolvedValue(undefined);
  });

  it("clears the caller's image, deletes the file, and revalidates", async () => {
    await expect(removeAvatar()).resolves.toEqual({ ok: true, image: null });

    expect(updateSet).toHaveBeenCalledWith({ image: null });
    expect(updateWhere).toHaveBeenCalledWith(["eq", "user-1"]);
    expect(del).toHaveBeenCalledWith(OLD_URL);
    expect(updateWhere.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("clears the DB even when file deletion fails, logging the failure", async () => {
    del.mockRejectedValue(new Error("disk"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(removeAvatar()).resolves.toEqual({ ok: true, image: null });

    expect(updateSet).toHaveBeenCalledWith({ image: null });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips file deletion when there is no avatar", async () => {
    selectLimit.mockResolvedValue([{ image: null }]);

    await expect(removeAvatar()).resolves.toEqual({ ok: true, image: null });

    expect(del).not.toHaveBeenCalled();
  });

  it("tolerates a missing user row", async () => {
    selectLimit.mockResolvedValue([]);

    await expect(removeAvatar()).resolves.toEqual({ ok: true, image: null });

    expect(del).not.toHaveBeenCalled();
  });

  it("keeps the file when the DB write fails", async () => {
    updateWhere.mockRejectedValue(new Error("db down"));

    await expect(removeAvatar()).rejects.toThrow("db down");

    expect(del).not.toHaveBeenCalled();
  });

  it("does nothing for a signed-out caller", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(removeAvatar()).rejects.toThrow("NEXT_REDIRECT");

    expect(update).not.toHaveBeenCalled();
  });
});
