import { describe, expect, it, vi } from "vitest";

describe("E2E production server settings", async () => {
  const { E2E_DIST_DIRECTORY, E2E_TIMEZONE, e2eBuildEnv, e2eServerEnv, hasE2EBuild } = await import("./e2e-server.mjs");

  it("points one server at its own port, database and storage while sharing the one build", () => {
    const env = e2eServerEnv({ port: 3002, databaseUrl: "postgres://host/arrivo_e2e_bootstrap", storageRoot: "store" });
    expect(env).toEqual({
      TZ: E2E_TIMEZONE,
      AUTH_TRUST_HOST: "true",
      DATABASE_URL: "postgres://host/arrivo_e2e_bootstrap?idle_timeout=5",
      NEXTAUTH_URL: "http://localhost:3002",
      NEXT_DISTDIR: E2E_DIST_DIRECTORY,
      ACTIVITY_MAINTENANCE_INTERVAL_HOURS: "0",
      E2E_MODE: "true",
      E2E_MAPBOX_STUB: "true",
      E2E_UNSPLASH_STUB: "true",
      STORAGE_PROVIDER: "local",
      STORAGE_LOCAL_ROOT_DIR: "store",
    });
  });

  it("keeps existing connection options when it adds the idle timeout", () => {
    const env = e2eServerEnv({
      port: 3001,
      databaseUrl: "postgres://u:p@host:5432/arrivo_e2e?sslmode=disable",
      storageRoot: "s",
    });
    expect(env.DATABASE_URL).toBe("postgres://u:p@host:5432/arrivo_e2e?sslmode=disable&idle_timeout=5");
  });

  it("builds production output into the shared E2E directory", () => {
    expect(e2eBuildEnv()).toMatchObject({ NODE_ENV: "production", NEXT_DISTDIR: ".next-e2e", E2E_MODE: "true" });
  });

  it("finds an existing build by its BUILD_ID", () => {
    const exists = vi.fn((path) => path.replaceAll("\\", "/") === "/repo/.next-e2e/BUILD_ID");
    expect(hasE2EBuild("/repo", exists)).toBe(true);
    expect(hasE2EBuild("/other", exists)).toBe(false);
  });
});
