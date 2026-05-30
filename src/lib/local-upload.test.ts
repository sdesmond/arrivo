// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBlobUploadUrl, isLocalUploadUrl, saveLocalUpload } from "./local-upload";

describe("saveLocalUpload", () => {
  let tempRootDir = "";

  beforeEach(async () => {
    tempRootDir = await mkdtemp(join(tmpdir(), "packt-local-upload-"));
  });

  afterEach(async () => {
    if (tempRootDir) {
      await rm(tempRootDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("writes the uploaded file into public/uploads and returns a relative url", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_717_171_717_171);
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);

    const file = new File(["cover-image"], "../My Summer Cover?.png", { type: "image/png" });

    const url = await saveLocalUpload(file, tempRootDir);

    expect(url).toBe("/uploads/1717171717171-4fzzzx-My_Summer_Cover_.png");

    const written = await readFile(join(tempRootDir, "public", "uploads", "1717171717171-4fzzzx-My_Summer_Cover_.png"));
    expect(written.toString()).toBe("cover-image");
  });
});

describe("upload url helpers", () => {
  it("recognizes local upload urls", () => {
    expect(isLocalUploadUrl("/uploads/cover.png")).toBe(true);
    expect(isLocalUploadUrl("https://images.example.com/cover.png")).toBe(false);
  });

  it("recognizes Blob-backed urls only", () => {
    expect(isBlobUploadUrl("https://blob.vercel.dev/cover.png")).toBe(true);
    expect(isBlobUploadUrl("https://blob.vercel.com/mapbox-covers/trip-1.jpg")).toBe(true);
    expect(isBlobUploadUrl("https://images.example.com/cover.png")).toBe(false);
    expect(isBlobUploadUrl("/uploads/cover.png")).toBe(false);
    expect(isBlobUploadUrl("graphic:var(--accent-brand)/plane")).toBe(false);
  });
});
