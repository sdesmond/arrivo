// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { applySeedAvatars, removeSeedAvatars, type SeedAvatarDb } from "./seed-avatars";
import { SEED_AVATARS } from "./seed-data/avatars";
import { DEV_SEED } from "./seed-data";
import { parseUploadStorageName } from "../lib/upload-policy";

function createAdapter() {
  return {
    put: vi.fn(async (key: string) => `/api/storage/${key}`),
    del: vi.fn(async () => undefined),
  };
}

function createDatabase(rows: { id: string; username: string; image?: string | null }[]) {
  const updates: { image: string | null; id: unknown }[] = [];
  const database = {
    select: () => ({ from: () => ({ where: async () => rows }) }),
    update: () => ({
      set: (values: { image: string | null }) => ({
        where: async (condition: unknown) => {
          updates.push({ image: values.image, id: condition });
        },
      }),
    }),
  } as unknown as SeedAvatarDb;
  return { database, updates };
}

describe("SEED_AVATARS", () => {
  it("belongs to real seed users and is a decodable 256x256 WebP each", async () => {
    const sharp = (await import("sharp")).default;
    const keys = new Set(DEV_SEED.users.map((seedUser) => seedUser.key));

    expect(Object.keys(SEED_AVATARS).length).toBeGreaterThan(0);
    for (const [key, base64] of Object.entries(SEED_AVATARS)) {
      expect(keys.has(key)).toBe(true);
      const metadata = await sharp(Buffer.from(base64, "base64")).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(["webp", 256, 256]);
    }
  });

  it("leaves some seed accounts without a photo so initials still show", () => {
    expect(Object.keys(SEED_AVATARS).length).toBeLessThan(DEV_SEED.users.length);
  });
});

describe("applySeedAvatars", () => {
  it("stores each avatar under the user's avatar prefix and saves the URL on that user's row", async () => {
    const adapter = createAdapter();
    const { database, updates } = createDatabase([
      { id: "id-demo", username: "demo" },
      { id: "id-alex", username: "alex" },
    ]);

    const count = await applySeedAvatars(database, adapter, { demo: "AAAA", alex: "BBBB" }, [
      { key: "demo", username: "demo" },
      { key: "alex", username: "alex" },
    ]);

    expect(count).toBe(2);
    expect(adapter.put).toHaveBeenCalledTimes(2);
    const [demoKey, demoFile] = adapter.put.mock.calls[0] as unknown as [string, File];
    expect(parseUploadStorageName(demoKey)).toMatchObject({ scope: "user-avatar", ownerId: "id-demo" });
    expect(demoKey.endsWith(".webp")).toBe(true);
    expect(demoFile.type).toBe("image/webp");
    expect(updates.map((update) => update.image)).toEqual([
      expect.stringMatching(/^\/api\/storage\/user-avatars\/id-demo\//),
      expect.stringMatching(/^\/api\/storage\/user-avatars\/id-alex\//),
    ]);
  });

  it("skips users without an avatar or without a seeded row", async () => {
    const adapter = createAdapter();
    const { database, updates } = createDatabase([{ id: "id-demo", username: "demo" }]);

    const count = await applySeedAvatars(database, adapter, { demo: "AAAA", ghost: "CCCC" }, [
      { key: "demo", username: "demo" },
      { key: "sam", username: "sam" },
      { key: "ghost", username: "ghost" },
    ]);

    expect(count).toBe(1);
    expect(adapter.put).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
  });

  it("deletes the stored file when saving the URL fails", async () => {
    const adapter = createAdapter();
    const { database } = createDatabase([{ id: "id-demo", username: "demo" }]);
    (database as unknown as { update: unknown }).update = () => ({
      set: () => ({
        where: async () => {
          throw new Error("db down");
        },
      }),
    });

    await expect(
      applySeedAvatars(database, adapter, { demo: "AAAA" }, [{ key: "demo", username: "demo" }])
    ).rejects.toThrow("db down");
    expect(adapter.del).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/storage\/user-avatars\/id-demo\//));
  });
});

describe("removeSeedAvatars", () => {
  it("deletes the files of seed accounts that have one, before they are wiped", async () => {
    const adapter = createAdapter();
    const { database } = createDatabase([
      { id: "id-demo", username: "demo", image: "/api/storage/user-avatars/id-demo/old.webp" },
      { id: "id-sam", username: "sam", image: null },
    ]);

    const count = await removeSeedAvatars(database, adapter, ["demo", "sam"]);

    expect(count).toBe(1);
    expect(adapter.del).toHaveBeenCalledTimes(1);
    expect(adapter.del).toHaveBeenCalledWith("/api/storage/user-avatars/id-demo/old.webp");
  });

  it("keeps going when a file cannot be deleted", async () => {
    const adapter = createAdapter();
    adapter.del.mockRejectedValueOnce(new Error("disk"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { database } = createDatabase([
      { id: "a", username: "demo", image: "/api/storage/user-avatars/a/1.webp" },
      { id: "b", username: "alex", image: "/api/storage/user-avatars/b/2.webp" },
    ]);

    await expect(removeSeedAvatars(database, adapter, ["demo", "alex"])).resolves.toBe(1);

    expect(adapter.del).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
