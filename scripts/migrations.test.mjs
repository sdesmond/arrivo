import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(import.meta.dirname, "..", "drizzle");
const journalPath = join(migrationsDir, "meta", "_journal.json");

describe("drizzle migrations", () => {
  it("has a committed journal", () => {
    expect(existsSync(journalPath)).toBe(true);
  });

  const { entries } = JSON.parse(readFileSync(journalPath, "utf8"));
  const sqlTags = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.replace(/\.sql$/, ""))
    .sort();

  it("lists every .sql file on disk, and nothing else", () => {
    expect(entries.map((entry) => entry.tag).sort()).toEqual(sqlTags);
  });

  it("numbers migrations sequentially from 0000", () => {
    entries.forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      expect(entry.tag.startsWith(String(index).padStart(4, "0") + "_")).toBe(true);
    });
  });

  it("has at least the baseline migration", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("has a snapshot for every migration", () => {
    for (const entry of entries) {
      const prefix = entry.tag.slice(0, 4);
      expect(existsSync(join(migrationsDir, "meta", `${prefix}_snapshot.json`)), entry.tag).toBe(true);
    }
  });

  it("keeps journal timestamps strictly increasing", () => {
    const times = entries.map((entry) => entry.when);
    expect(times).toEqual([...times].sort((first, second) => first - second));
    expect(new Set(times).size).toBe(times.length);
  });
  describe("0004_instance_state_roles", () => {
    const migration = readFileSync(join(migrationsDir, "0004_instance_state_roles.sql"), "utf8");

    it("creates the singleton and seeds it, initialized only when an account already exists", () => {
      expect(migration).toContain('CREATE TABLE "instance_state"');
      expect(migration).toMatch(/INSERT INTO "instance_state"[\s\S]*CASE WHEN EXISTS \(SELECT 1 FROM "users"\)/);
    });

    it("promotes the sole legacy account", () => {
      expect(migration).toMatch(/UPDATE "users" SET "role" = 'admin' WHERE \(SELECT count\(\*\) FROM "users"\) = 1/);
    });

    it("halts with an operator remedy on several accounts, before any schema change", () => {
      const halt = migration.indexOf("RAISE EXCEPTION");
      expect(halt).toBeGreaterThan(-1);
      expect(migration).toContain("account_count > 1");
      expect(migration).toMatch(/delete the others/);
      expect(halt).toBeLessThan(migration.indexOf("CREATE TABLE"));
    });
  });
});
