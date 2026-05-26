import { describe, expect, it } from "vitest";
import { E2E_RESET_STATEMENTS, getRequiredE2EConnectionString } from "./e2e-reset";

describe("getRequiredE2EConnectionString", () => {
  it("returns the configured E2E connection string", () => {
    const env = { E2E_DATABASE_URL: "postgres://e2e-db" };

    expect(getRequiredE2EConnectionString(env)).toBe("postgres://e2e-db");
  });

  it("throws when the E2E connection string is missing", () => {
    const env = {};

    expect(() => getRequiredE2EConnectionString(env)).toThrow(
      "E2E_DATABASE_URL is required to reset the E2E database."
    );
  });
});

describe("E2E_RESET_STATEMENTS", () => {
  it("rebuilds the public schema before extensions are restored", () => {
    expect(E2E_RESET_STATEMENTS).toEqual([
      "DROP SCHEMA IF EXISTS public CASCADE",
      "CREATE SCHEMA public",
      "GRANT ALL ON SCHEMA public TO CURRENT_USER",
      "GRANT ALL ON SCHEMA public TO PUBLIC",
      "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public",
    ]);
  });
});
