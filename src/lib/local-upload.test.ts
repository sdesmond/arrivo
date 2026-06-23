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

    const url = await saveLocalUpload(file, { rootDir: tempRootDir });

    expect(url).toBe("/uploads/1717171717171-4fzzzx-My_Summer_Cover_.png");

    const written = await readFile(join(tempRootDir, "public", "uploads", "1717171717171-4fzzzx-My_Summer_Cover_.png"));
    expect(written.toString()).toBe("cover-image");
  });

  it("writes to a caller-supplied storage path instead of reusing the original filename", async () => {
    const file = new File(["reservation-pdf"], "../Original Name?.pdf", { type: "application/pdf" });

    const url = await saveLocalUpload(file, {
      rootDir: tempRootDir,
      storageName: "reservation-documents/res-1/upload-1234.pdf",
    });

    expect(url).toBe("/uploads/reservation-documents/res-1/upload-1234.pdf");

    const written = await readFile(
      join(tempRootDir, "public", "uploads", "reservation-documents", "res-1", "upload-1234.pdf")
    );
    expect(written.toString()).toBe("reservation-pdf");
  });

  it("rejects an empty storage name", async () => {
    const file = new File(["cover-image"], "cover.png", { type: "image/png" });

    await expect(
      saveLocalUpload(file, {
        rootDir: tempRootDir,
        storageName: "",
      })
    ).rejects.toThrow("Invalid upload storage name");
  });

  it("rejects storage names with path traversal segments", async () => {
    const file = new File(["cover-image"], "cover.png", { type: "image/png" });

    await expect(
      saveLocalUpload(file, {
        rootDir: tempRootDir,
        storageName: "trip-1/../cover.png",
      })
    ).rejects.toThrow("Invalid upload storage name");
  });

  it("falls back to process.cwd() when rootDir is omitted", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(tempRootDir);
    const file = new File(["cover-image"], "cover.png", { type: "image/png" });

    const url = await saveLocalUpload(file);

    expect(url).toMatch(/^\/uploads\//);
    const writtenName = url.replace("/uploads/", "");
    const written = await readFile(join(tempRootDir, "public", "uploads", writtenName));
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
