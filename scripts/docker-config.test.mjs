import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = join(import.meta.dirname, "..");
// Normalize CRLF: Windows checkouts with core.autocrlf rewrite these files' line endings.
const readRootFile = (name) => readFileSync(join(rootDir, name), "utf8").replace(/\r\n/g, "\n");

// Returns the indented block for one top-level-service key, e.g. serviceBlock(compose, "db").
function serviceBlock(compose, service) {
  const match = compose.match(new RegExp(`^  ${service}:\\n((?:(?:    .*)?\\n)+)`, "m"));
  if (!match) throw new Error(`service "${service}" not found`);
  return match[1];
}

describe("docker-compose.yml (self-hosting stack)", () => {
  const compose = readRootFile("docker-compose.yml");

  it("pins Postgres 17 and restarts the database with the host", () => {
    const db = serviceBlock(compose, "db");
    expect(db).toContain("image: postgres:17-alpine");
    expect(db).toContain("restart: unless-stopped");
    expect(db).toContain("pg_isready -d arrivo -U arrivo");
  });

  it("stores data in host bind mounts under DATA_DIR", () => {
    expect(serviceBlock(compose, "db")).toContain("${DATA_DIR:-./data}/pgdata:/var/lib/postgresql/data");
    expect(serviceBlock(compose, "app")).toContain("${DATA_DIR:-./data}/storage:/app/storage");
    expect(compose).not.toMatch(/^volumes:/m);
  });

  it("pulls published images at a configurable version instead of building", () => {
    const migrate = serviceBlock(compose, "migrate");
    const app = serviceBlock(compose, "app");
    expect(migrate).toContain("image: ghcr.io/sdesmond/arrivo-migrate:${VERSION:-latest}");
    expect(app).toContain("image: ghcr.io/sdesmond/arrivo:${VERSION:-latest}");
    expect(compose).not.toMatch(/^\s+build:/m);
  });

  it("passes the Mapbox public token at runtime", () => {
    expect(serviceBlock(compose, "app")).toContain("MAPBOX_PUBLIC_TOKEN: ${MAPBOX_PUBLIC_TOKEN:-}");
  });

  it("runs migrate once and starts the app only after it succeeds", () => {
    expect(serviceBlock(compose, "migrate")).toContain('restart: "no"');
    expect(serviceBlock(compose, "app")).toContain("condition: service_completed_successfully");
    expect(serviceBlock(compose, "app")).toContain(":3000");
  });
});

describe("docker-compose.build.yml (build-from-source override)", () => {
  const compose = readRootFile("docker-compose.build.yml");

  it("builds both targets from the repo under local image tags", () => {
    const migrate = serviceBlock(compose, "migrate");
    const app = serviceBlock(compose, "app");
    expect(migrate).toContain("image: arrivo-migrate:local");
    expect(migrate).toContain("target: tools");
    expect(app).toContain("image: arrivo-app:local");
    expect(app).toContain("target: runner");
  });
});

describe("publish-images workflow", () => {
  const workflow = readRootFile(".github/workflows/publish-images.yml");

  it("publishes on version tags and on manual dispatch", () => {
    expect(workflow).toMatch(/tags:\n\s+- "v\*\.\*\.\*"/);
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("packages: write");
  });

  it("moves latest only for full releases, never prereleases like v1.2.0-rc.1", () => {
    const latestRules = workflow.match(/type=raw,value=latest,enable=.*$/gm);
    expect(latestRules).toHaveLength(2);
    for (const rule of latestRules) expect(rule).toContain("!contains(github.ref_name, '-')");
  });

  it("builds both images for amd64 and arm64", () => {
    expect(workflow).toMatch(/images: ghcr\.io\/sdesmond\/arrivo$/m);
    expect(workflow).toMatch(/images: ghcr\.io\/sdesmond\/arrivo-migrate$/m);
    expect(workflow).toContain("target: runner");
    expect(workflow).toContain("target: tools");
    expect(workflow.match(/platforms: linux\/amd64,linux\/arm64/g)).toHaveLength(2);
  });
});

describe("docker-compose.dev.yml (local dev database)", () => {
  const compose = readRootFile("docker-compose.dev.yml");

  it("uses its own project name so it never replaces the self-hosting stack's db", () => {
    expect(compose).toMatch(/^name: arrivo-dev$/m);
  });

  it("uses the same Postgres major as the self-hosting stack", () => {
    expect(serviceBlock(compose, "db")).toContain("image: postgres:17-alpine");
  });

  it("publishes 5433 (not 5432, which a host Postgres usually owns) and keeps data in a named volume", () => {
    const db = serviceBlock(compose, "db");
    expect(db).toContain('"5433:5432"');
    expect(db).toContain("pgdata:/var/lib/postgresql/data");
    expect(compose).toMatch(/^volumes:\n  pgdata:/m);
  });
});

describe("docker build context and docs", () => {
  it("keeps bind-mounted data out of the build context", () => {
    expect(readRootFile(".dockerignore").split(/\r?\n/)).toContain("data");
  });

  it("documents the Postgres major the stack runs", () => {
    expect(readRootFile("docs/self-hosting.md")).toContain("PostgreSQL 17");
  });
});
