import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveBootstrapConnectionString, ensureBootstrapDatabase, selectWorkerDatabase } from "./e2e-bootstrap.mjs";

// Inspect the real config without discovering BDD files or starting Playwright's test framework.
vi.mock("playwright-bdd", () => ({ defineBddConfig: () => ".features-gen" }));
vi.mock("@playwright/test", () => ({
  defineConfig: (config) => config,
  devices: { "Desktop Chrome": { browserName: "chromium" } },
}));
vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
});

const source = "postgres://example.test:5432/arrivo_e2e?sslmode=require&connect_timeout=12";
describe("bootstrap database isolation", () => {
  it("changes only database path and preserves host, port and options", () => {
    const derived = new URL(deriveBootstrapConnectionString(source));
    const original = new URL(source);
    expect(derived.pathname).toBe("/arrivo_e2e_bootstrap");
    derived.pathname = original.pathname;
    expect(derived.toString()).toBe(original.toString());
    expect(selectWorkerDatabase(source, false)).toBe(source);
    expect(selectWorkerDatabase(source, true)).toBe(deriveBootstrapConnectionString(source));
  });
  it.each([
    undefined,
    "",
    "bad",
    "https://example.test/arrivo_e2e",
    "postgres://host/",
    "postgres://host/a%22b",
    "postgres://host/" + "x".repeat(54),
    "postgres://host/arrivo_e2e_bootstrap",
  ])("rejects unsafe or ambiguous source without leaking URL", (value) => {
    expect(() => deriveBootstrapConnectionString(value)).toThrow("E2E database");
    try {
      deriveBootstrapConnectionString(value);
    } catch (error) {
      expect(error.message).not.toContain("secret");
    }
  });
  function database(exists, canCreate = false) {
    const client = {
      unsafe: vi
        .fn()
        .mockResolvedValueOnce(exists ? [{ exists: true }] : [])
        .mockResolvedValueOnce([{ canCreate }])
        .mockResolvedValue([]),
      end: vi.fn(),
    };
    const connect = vi.fn(() => client);
    return { client, connect };
  }
  it("uses an existing derived database without CREATEDB privilege", async () => {
    const { client, connect } = database(true);
    await ensureBootstrapDatabase(source, connect);
    expect(client.unsafe).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(source, expect.objectContaining({ max: 1 }));
    expect(client.end).toHaveBeenCalled();
  });
  it("creates only missing derived database using a quoted identifier", async () => {
    const { client, connect } = database(false, true);
    await ensureBootstrapDatabase(source, connect);
    expect(client.unsafe).toHaveBeenLastCalledWith('CREATE DATABASE "arrivo_e2e_bootstrap"');
    expect(client.end).toHaveBeenCalled();
  });
  it("fails safely with precreate guidance when role cannot create", async () => {
    const { client, connect } = database(false);
    await expect(ensureBootstrapDatabase(source, connect)).rejects.toThrow(
      "Create the derived E2E bootstrap database or grant CREATEDB"
    );
    expect(client.unsafe).toHaveBeenCalledTimes(2);
    expect(client.end).toHaveBeenCalled();
  });
  it("does no DB work for invalid source", async () => {
    const connect = vi.fn();
    await expect(ensureBootstrapDatabase("invalid", connect)).rejects.toThrow();
    expect(connect).not.toHaveBeenCalled();
  });
  it("sanitizes connection errors and closes client", async () => {
    const { client, connect } = database(false);
    client.unsafe.mockReset().mockRejectedValue(new Error(source));
    await expect(ensureBootstrapDatabase(source, connect)).rejects.toThrow(
      "Could not prepare the E2E bootstrap database."
    );
    expect(client.end).toHaveBeenCalled();
  });
});

describe("Playwright project isolation wiring", () => {
  it("uses a distinct app and database for bootstrap with no normal auth dependency", async () => {
    vi.stubEnv("E2E_DATABASE_URL", source);
    vi.stubEnv("TZ", process.env.TZ);
    const { default: config } = await import("../playwright.config.ts");
    const regular = config.projects.find((project) => project.name === "chromium");
    const bootstrap = config.projects.find((project) => project.name === "bootstrap");
    const feature = "instance-bootstrap.feature.spec.js";
    expect(regular.testIgnore.test(feature)).toBe(true);
    expect(bootstrap.testMatch.test(feature)).toBe(true);
    expect(bootstrap.dependencies).toBeUndefined();
    expect(bootstrap.use).toMatchObject({
      baseURL: "http://localhost:3002",
      bootstrapDatabase: true,
      storageState: { cookies: [], origins: [] },
    });
    expect(config.webServer.map((server) => server.env.NEXT_DISTDIR)).toEqual([".next-e2e", ".next-e2e-bootstrap"]);
    expect(config.webServer.map((server) => new URL(server.env.DATABASE_URL).pathname)).toEqual([
      "/arrivo_e2e",
      "/arrivo_e2e_bootstrap",
    ]);
    expect(config.webServer.map((server) => server.env.STORAGE_LOCAL_ROOT_DIR)).toEqual([
      ".e2e-storage",
      ".e2e-bootstrap-storage",
    ]);
  });
});
