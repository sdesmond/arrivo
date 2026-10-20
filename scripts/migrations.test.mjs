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
});
