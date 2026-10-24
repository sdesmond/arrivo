import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("setup-dev helpers", async () => {
  const { DEV_COMPOSE_ARGS, buildDockerE2eDatabaseArgs, buildSetupPlan, ensureAiToolLinks, mergeEnvForSetup } =
    await import("./setup-dev.mjs");

  it("docker mode checks for, then creates, the E2E database the compose file doesn't provision", () => {
    const { check, create } = buildDockerE2eDatabaseArgs();

    expect(check.slice(0, 4)).toEqual(["compose", "-f", "docker-compose.dev.yml", "exec"]);
    expect(check.join(" ")).toContain("FROM pg_database WHERE datname='arrivo_e2e'");
    expect(create.join(" ")).toContain("CREATE DATABASE arrivo_e2e OWNER arrivo");
  });

  it("docker mode targets the dev compose file", () => {
    expect(DEV_COMPOSE_ARGS).toEqual(["compose", "-f", "docker-compose.dev.yml"]);
  });

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
      "DATABASE_URL=postgres://arrivo:arrivo@localhost:5432/arrivo",
      "E2E_DATABASE_URL=postgres://arrivo:arrivo@localhost:5432/arrivo_e2e",
      "NEXTAUTH_URL=http://localhost:3000",
      "NEXTAUTH_SECRET=change-me-32-bytes-min",
      "ALLOW_SIGNUP=true",
      "E2E_USERNAME=e2e",
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

    expect(merged).toContain("DATABASE_URL=postgres://arrivo:arrivo@localhost:5432/arrivo");
    expect(merged).toContain("E2E_DATABASE_URL=postgres://arrivo:arrivo@localhost:5432/arrivo_e2e");
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

    const keyLine = merged.split("\n").find((line) => line.startsWith("DATA_ENCRYPTION_KEY="));
    const key = JSON.parse(keyLine?.slice("DATA_ENCRYPTION_KEY=".length) ?? '""');
    expect(Buffer.from(key, "base64")).toHaveLength(32);
  });

  it("keeps an existing data encryption key so encrypted rows stay readable", () => {
    const existingKey = Buffer.alloc(32, 7).toString("base64");
    const merged = mergeEnvForSetup("DATA_ENCRYPTION_KEY=\n", `DATA_ENCRYPTION_KEY=${existingKey}\n`);
    expect(merged).toContain(`DATA_ENCRYPTION_KEY=${JSON.stringify(existingKey)}`);
  });

  it("points docker mode at the dev container's published port, overriding a stale .env", () => {
    const example = "DATABASE_URL=postgres://arrivo:arrivo@localhost:5432/arrivo\n";
    const merged = mergeEnvForSetup(example, "DATABASE_URL=postgres://arrivo:arrivo@localhost:5432/arrivo\n", "docker");

    expect(merged).toContain("DATABASE_URL=postgres://arrivo:arrivo@localhost:5433/arrivo");
    expect(merged).toContain("E2E_DATABASE_URL=postgres://arrivo:arrivo@localhost:5433/arrivo_e2e");
  });

  it("preserves an existing local storage root", () => {
    const example = "STORAGE_PROVIDER=local\nSTORAGE_LOCAL_ROOT_DIR=./.dev-storage\n";
    const merged = mergeEnvForSetup(example, "STORAGE_LOCAL_ROOT_DIR=/var/lib/app-storage\n");

    expect(merged).toContain("STORAGE_PROVIDER=local");
    expect(merged).toContain("STORAGE_LOCAL_ROOT_DIR=/var/lib/app-storage");
  });

  it("migrates claude memories into the shared agents directory", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "setup-dev-"));
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

  it("replaces a dangling link left behind by a moved or renamed repo", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "setup-dev-"));
    const staleTargetDir = join(rootDir, "old-location", "skills");
    const skillsLinkPath = join(rootDir, ".claude", "skills");

    mkdirSync(staleTargetDir, { recursive: true });
    mkdirSync(join(rootDir, ".claude"), { recursive: true });
    symlinkSync(staleTargetDir, skillsLinkPath, "junction");
    rmSync(join(rootDir, "old-location"), { recursive: true, force: true });

    try {
      expect(existsSync(skillsLinkPath)).toBe(false);
      expect(lstatSync(skillsLinkPath).isSymbolicLink()).toBe(true);

      ensureAiToolLinks(rootDir);

      expect(lstatSync(skillsLinkPath).isSymbolicLink()).toBe(true);
      expect(existsSync(skillsLinkPath)).toBe(true);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
