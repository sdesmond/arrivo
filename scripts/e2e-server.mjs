import { existsSync } from "node:fs";
import { join } from "node:path";

// E2E runs against a production build (`next build` + `next start`). `next dev` grew past 12 GB over a full run and
// never released it; a production server stays under 0.5 GB. Every E2E app process (the regular and bootstrap
// servers and the password-policy apps) serves this one build with its own port, database and storage.
export const E2E_DIST_DIRECTORY = ".next-e2e";

// E2E assumes one local timezone, same as Vitest (vitest.config.mts): Linked Events and day bucketing use the
// server's local date, steps compute floating "now" in the runner, and client components read browser-local time.
export const E2E_TIMEZONE = "America/Denver";

const E2E_FLAGS = {
  ACTIVITY_MAINTENANCE_INTERVAL_HOURS: "0",
  E2E_MODE: "true",
  E2E_MAPBOX_STUB: "true",
  E2E_UNSPLASH_STUB: "true",
};

// Seconds before an app server closes an idle Postgres connection. postgres.js keeps a pool's connections open forever
// by default, so a finished password-policy app or an idle bootstrap server would otherwise hold ~12 connections each
// against the default max_connections (100) for the rest of the run. postgres.js reads it from the URL.
const IDLE_TIMEOUT_SECONDS = "5";

function withIdleTimeout(databaseUrl) {
  const url = new URL(databaseUrl);
  url.searchParams.set("idle_timeout", IDLE_TIMEOUT_SECONDS);
  return url.toString();
}

/** Runtime environment for one E2E app server. */
export function e2eServerEnv({ port, databaseUrl, storageRoot }) {
  return {
    TZ: E2E_TIMEZONE,
    // `next dev` trusts any host; in production Auth.js rejects localhost callbacks without this.
    AUTH_TRUST_HOST: "true",
    DATABASE_URL: withIdleTimeout(databaseUrl),
    NEXTAUTH_URL: `http://localhost:${port}`,
    NEXT_DISTDIR: E2E_DIST_DIRECTORY,
    ...E2E_FLAGS,
    STORAGE_PROVIDER: "local",
    STORAGE_LOCAL_ROOT_DIR: storageRoot,
  };
}

/** Environment for the `next build` every E2E server then serves. */
export function e2eBuildEnv() {
  return { NODE_ENV: "production", TZ: E2E_TIMEZONE, NEXT_DISTDIR: E2E_DIST_DIRECTORY, ...E2E_FLAGS };
}

export function hasE2EBuild(rootDir, exists = existsSync) {
  return exists(join(rootDir, E2E_DIST_DIRECTORY, "BUILD_ID"));
}
