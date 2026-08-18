import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("setup-dev helpers", async () => {
  const { buildSetupPlan, ensureAiToolLinks, mergeEnvForSetup } = await import("./setup-dev.mjs");

  it("defaults to auto database mode", () => {
    expect(buildSetupPlan([])).toEqual({
      requestedDatabaseMode: "auto",
      platform: process.platform,
    });
  });

  it("accepts an explicit database mode", () => {
    expect(buildSetupPlan(["--db=local"], "win32")).toEqual({
      requestedDatabaseMode: "local",
      platform: "win32",
    });
  });

  it("rejects unsupported database modes", () => {
    expect(() => buildSetupPlan(["--db=sqlite"])).toThrow('Unsupported database mode "sqlite"');
  });

  it("merges env values and generates a real secret", () => {
    const baseExample = [
      "DATABASE_URL=postgres://packt:packt@localhost:5432/packt",
      "E2E_DATABASE_URL=postgres://packt:packt@localhost:5432/packt_e2e",
      "NEXTAUTH_URL=http://localhost:3000",
      "NEXTAUTH_SECRET=change-me-32-bytes-min",
      "ALLOW_SIGNUP=true",
      "E2E_EMAIL=e2e@packt.local",
      "E2E_PASSWORD=e2e1234",
      "HIDE_OVERLAY=true",
      "STORAGE_PROVIDER=local",
      "STORAGE_LOCAL_ROOT_DIR=./.dev-storage",
      "",
    ].join("\n");

    const merged = mergeEnvForSetup(
      baseExample,
      [
        "NEXTAUTH_URL=http://localhost:4000",
        "ALLOW_SIGNUP=false",
        "UPLOAD_STUB=true",
        "BLOB_READ_WRITE_TOKEN=legacy-token",
        "",
      ].join("\n")
    );

    expect(merged).toContain("DATABASE_URL=postgres://packt:packt@localhost:5432/packt");
    expect(merged).toContain("E2E_DATABASE_URL=postgres://packt:packt@localhost:5432/packt_e2e");
    expect(merged).toContain("NEXTAUTH_URL=http://localhost:4000");
    expect(merged).toContain("ALLOW_SIGNUP=false");
    expect(merged).toContain("STORAGE_PROVIDER=local");
    expect(merged).toContain("STORAGE_LOCAL_ROOT_DIR=./.dev-storage");
    expect(merged).not.toContain("UPLOAD_STUB=");
    expect(merged).not.toContain("BLOB_READ_WRITE_TOKEN=");

    const secretLine = merged.split("\n").find((line) => line.startsWith("NEXTAUTH_SECRET="));
    const secret = secretLine?.slice("NEXTAUTH_SECRET=".length) ?? "";
    expect(secret).not.toBe("change-me-32-bytes-min");
    expect(secret.length).toBeGreaterThanOrEqual(43);
  });

  it("preserves an existing local storage root", () => {
    const example = "STORAGE_PROVIDER=local\nSTORAGE_LOCAL_ROOT_DIR=./.dev-storage\n";
    const merged = mergeEnvForSetup(example, "STORAGE_LOCAL_ROOT_DIR=/var/lib/packt-storage\n");

    expect(merged).toContain("STORAGE_PROVIDER=local");
    expect(merged).toContain("STORAGE_LOCAL_ROOT_DIR=/var/lib/packt-storage");
  });

  it("migrates claude memories into the shared agents directory", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "packt-setup-dev-"));
    const legacyMemoryDir = join(rootDir, ".claude", "memory");
    const migratedMemoryPath = join(rootDir, ".agents", "memories", "legacy-note.md");

    mkdirSync(legacyMemoryDir, { recursive: true });
    writeFileSync(join(legacyMemoryDir, "legacy-note.md"), "remember this\n", "utf8");

    try {
      ensureAiToolLinks(rootDir);

      expect(readFileSync(migratedMemoryPath, "utf8")).toBe("remember this\n");
      expect(lstatSync(join(rootDir, ".claude", "memory")).isSymbolicLink()).toBe(true);
      expect(existsSync(join(rootDir, ".claude", "memory", "legacy-note.md"))).toBe(true);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
