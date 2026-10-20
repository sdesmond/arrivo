// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
import { MIGRATION_LOCK_KEY, runMigrations } from "./migrate";

// A tagged-template stand-in for postgres.Sql that records each query as "text with ? placeholders".
function fakeSql(options: { failPings?: number } = {}) {
  const queries: string[] = [];
  let pingFailures = options.failPings ?? 0;
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    queries.push(text);
    if (text === "select 1" && pingFailures > 0) {
      pingFailures -= 1;
      throw new Error("connect ECONNREFUSED");
    }
    return values;
  }) as unknown as postgres.Sql & { mock: { calls: unknown[][] } };
  Object.assign(sql, { end: vi.fn(async () => undefined) });
  return { sql, queries };
}

function baseOptions(sql: postgres.Sql, applyMigrations = vi.fn(async (): Promise<void> => {})) {
  return {
    databaseUrl: "postgres://arrivo:arrivo@db:5432/arrivo",
    migrationsFolder: "./drizzle",
    connect: vi.fn(() => sql),
    applyMigrations,
    sleep: vi.fn(async () => undefined),
    log: vi.fn(),
  };
}

describe("runMigrations", () => {
  it("applies migrations while holding the advisory lock, then releases it and closes the connection", async () => {
    const { sql, queries } = fakeSql();
    const applyMigrations = vi.fn(async () => {
      queries.push("<migrate>");
    });
    const options = baseOptions(sql, applyMigrations);

    await runMigrations(options);

    expect(options.connect).toHaveBeenCalledWith("postgres://arrivo:arrivo@db:5432/arrivo");
    expect(applyMigrations).toHaveBeenCalledWith(sql, "./drizzle");
    expect(queries).toEqual(["select 1", "select pg_advisory_lock(?)", "<migrate>", "select pg_advisory_unlock(?)"]);
    expect(sql).toHaveBeenCalledWith(expect.anything(), MIGRATION_LOCK_KEY);
    expect(sql.end).toHaveBeenCalledOnce();
  });

  it("releases the lock and closes the connection when a migration fails", async () => {
    const { sql, queries } = fakeSql();
    const options = baseOptions(
      sql,
      vi.fn(async () => {
        throw new Error("relation already exists");
      })
    );

    await expect(runMigrations(options)).rejects.toThrow("relation already exists");
    expect(queries).toContain("select pg_advisory_unlock(?)");
    expect(sql.end).toHaveBeenCalledOnce();
  });

  it("waits for the database to accept connections before locking", async () => {
    const { sql, queries } = fakeSql({ failPings: 2 });
    const options = baseOptions(sql);

    await runMigrations(options);

    expect(options.sleep).toHaveBeenCalledTimes(2);
    expect(queries.filter((query) => query === "select 1")).toHaveLength(3);
    expect(options.applyMigrations).toHaveBeenCalledOnce();
  });

  it("gives up after the last connection attempt without migrating", async () => {
    const { sql } = fakeSql({ failPings: Number.POSITIVE_INFINITY });
    const options = { ...baseOptions(sql), maxAttempts: 3 };

    await expect(runMigrations(options)).rejects.toThrow("connect ECONNREFUSED");
    expect(options.sleep).toHaveBeenCalledTimes(2);
    expect(options.applyMigrations).not.toHaveBeenCalled();
    expect(sql.end).toHaveBeenCalledOnce();
  });
});
