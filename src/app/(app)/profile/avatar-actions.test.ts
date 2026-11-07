// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireUser,
  selectForUpdate,
  updateWhere,
  updateSet,
  update,
  transaction,
  tx,
  put,
  del,
  revalidatePath,
  processAvatarImage,
} = vi.hoisted(() => {
  const selectForUpdate = vi.fn();
  const updateWhere = vi.fn();
  const updateSet = vi.fn<(values: { image: string | null }) => { where: typeof updateWhere }>(() => ({
    where: updateWhere,
  }));
  const update = vi.fn(() => ({ set: updateSet }));
  // The row lock is what keeps concurrent swaps in line; `select ... for update` ends the chain.
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: selectForUpdate }) }) }) }),
    update,
  };
  return {
    requireUser: vi.fn(),
    selectForUpdate,
    updateWhere,
    updateSet,
    update,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    tx,
    put: vi.fn(),
    del: vi.fn(),
    revalidatePath: vi.fn(),
    processAvatarImage: vi.fn(),
  };
});

vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/db", () => ({ db: { transaction } }));
vi.mock("@/db/schema", () => ({ users: { id: "users.id", image: "users.image" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn((_column: unknown, value: unknown) => ["eq", value]) }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ put, del }) }));
vi.mock("@/lib/avatar-image", async () => {
  const actual = await vi.importActual<typeof import("@/lib/avatar-image")>("@/lib/avatar-image");
  return { ...actual, processAvatarImage };
});

import { AvatarImageError } from "@/lib/avatar-image";
import { RATE_LIMITS, resetRateLimits } from "@/lib/rate-limit";
import { removeAvatar, uploadAvatar } from "./avatar-actions";

const OLD_URL = "/api/storage/user-avatars/user-1/old.webp";
const NEW_URL = "/api/storage/user-avatars/user-1/new.webp";

// A test that models concurrent swaps replaces these; put them back so the next test starts from the plain mocks.
function resetDbMocks() {
  vi.clearAllMocks();
  transaction.mockImplementation(async (callback) => callback(tx));
  updateSet.mockImplementation(() => ({ where: updateWhere }));
}

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
    resetDbMocks();
    resetRateLimits();
    requireUser.mockResolvedValue({ id: "user-1" });
    selectForUpdate.mockResolvedValue([{ image: null }]);
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
    selectForUpdate.mockResolvedValue([{ image: OLD_URL }]);

    await uploadAvatar(formWith(pngFile()));

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(OLD_URL);
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0]);
    expect(updateWhere.mock.invocationCallOrder[0]).toBeLessThan(del.mock.invocationCallOrder[0]);
  });

  it("stores the file first, then reads the previous image under a row lock in the transaction that swaps it", async () => {
    await uploadAvatar(formWith(pngFile()));

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(selectForUpdate).toHaveBeenCalledWith("update");
    expect(put.mock.invocationCallOrder[0]).toBeLessThan(transaction.mock.invocationCallOrder[0]);
    expect(selectForUpdate.mock.invocationCallOrder[0]).toBeLessThan(updateWhere.mock.invocationCallOrder[0]);
  });

  it("deletes exactly the file each overlapping upload replaced, so none is orphaned", async () => {
    let current: string | null = OLD_URL;
    let lock: Promise<unknown> = Promise.resolve();
    // Row locks make concurrent swaps queue; model that, with the row's value shared between them.
    transaction.mockImplementation((callback) => {
      const result = lock.then(() => callback(tx));
      lock = result.catch(() => undefined);
      return result;
    });
    selectForUpdate.mockImplementation(async () => [{ image: current }]);
    let pending: string | null = null;
    updateSet.mockImplementation((values) => {
      pending = values.image;
      return { where: updateWhere };
    });
    updateWhere.mockImplementation(async () => {
      current = pending;
    });
    put.mockImplementation(async (name: string) => `/api/storage/${name}`);

    await Promise.all([uploadAvatar(formWith(pngFile())), uploadAvatar(formWith(pngFile()))]);

    const stored = put.mock.calls.map(([name]) => `/api/storage/${name}`);
    expect(stored).toHaveLength(2);
    expect(stored).toContain(current);
    const deleted = del.mock.calls.map(([url]) => url);
    expect(deleted).toHaveLength(2);
    expect(new Set(deleted)).toEqual(new Set([OLD_URL, ...stored.filter((url) => url !== current)]));
  });

  it("refuses a flood of uploads before decoding or storing any more images", async () => {
    const { max } = RATE_LIMITS.avatarUpload;
    for (let call = 0; call < max; call += 1) {
      await expect(uploadAvatar(formWith(pngFile()))).resolves.toEqual({ ok: true, image: NEW_URL });
    }

    await expect(uploadAvatar(formWith(pngFile()))).resolves.toEqual({
      ok: false,
      error: "Too many uploads. Try again in a minute.",
    });

    expect(processAvatarImage).toHaveBeenCalledTimes(max);
    expect(put).toHaveBeenCalledTimes(max);
  });

  it("budgets each user separately", async () => {
    for (let call = 0; call < RATE_LIMITS.avatarUpload.max; call += 1) await uploadAvatar(formWith(pngFile()));
    requireUser.mockResolvedValue({ id: "user-2" });

    await expect(uploadAvatar(formWith(pngFile()))).resolves.toEqual({ ok: true, image: NEW_URL });
  });

  it("does not spend budget on a file that fails validation", async () => {
    const bad = () => new File(["x"], "me.gif", { type: "image/gif" });
    for (let call = 0; call < RATE_LIMITS.avatarUpload.max + 5; call += 1) await uploadAvatar(formWith(bad()));

    await expect(uploadAvatar(formWith(pngFile()))).resolves.toEqual({ ok: true, image: NEW_URL });
  });

  it("logs, not throws, when the previous file cannot be deleted", async () => {
    selectForUpdate.mockResolvedValue([{ image: OLD_URL }]);
    del.mockRejectedValue(new Error("disk"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(uploadAvatar(formWith(pngFile()))).resolves.toEqual({ ok: true, image: NEW_URL });

    expect(warn).toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("deletes the new file and rethrows when the DB write fails", async () => {
    selectForUpdate.mockResolvedValue([{ image: OLD_URL }]);
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
    resetDbMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    selectForUpdate.mockResolvedValue([{ image: OLD_URL }]);
    updateWhere.mockResolvedValue(undefined);
    del.mockResolvedValue(undefined);
  });

  it("clears the caller's image, deletes the file, and revalidates", async () => {
    await expect(removeAvatar()).resolves.toEqual({ ok: true, image: null });

    expect(selectForUpdate).toHaveBeenCalledWith("update");
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
    selectForUpdate.mockResolvedValue([{ image: null }]);

    await expect(removeAvatar()).resolves.toEqual({ ok: true, image: null });

    expect(del).not.toHaveBeenCalled();
  });

  it("tolerates a missing user row", async () => {
    selectForUpdate.mockResolvedValue([]);

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
