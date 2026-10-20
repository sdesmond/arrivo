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

describe("ci workflow (migration safety)", () => {
  const workflow = readRootFile(".github/workflows/ci.yml");

  it("runs on pull requests and pushes to main", () => {
    expect(workflow).toContain("pull_request:");
    expect(workflow).toMatch(/push:\n\s+branches: \[main\]/);
  });

  it("fails when schema.ts changes without a generated migration", () => {
    expect(workflow).toContain("npx drizzle-kit generate");
    expect(workflow).toContain("git status --porcelain -- drizzle");
  });

  it("cannot hang on drizzle-kit's interactive rename prompt", () => {
    expect(workflow).toMatch(/Migrations are up to date with schema\.ts\n\s+timeout-minutes: \d+/);
    expect(workflow).toContain("npx drizzle-kit generate </dev/null");
  });

  it("diffs the migrated schema against one built straight from schema.ts", () => {
    expect(workflow).toContain("npx drizzle-kit push --force");
    expect(workflow).toContain("pg_dump -s");
    expect(workflow).toMatch(/diff .*migrated.*pushed/);
  });

  it("applies migrations to an empty Postgres 17 twice, from source and from the image", () => {
    expect(workflow.match(/image: postgres:17-alpine/g)).toHaveLength(2);
    expect(workflow.match(/run: npm run db:migrate$/gm)).toHaveLength(2);
    expect(workflow).toContain("target: tools");
    expect(workflow.match(/docker run --rm --network host -e DATABASE_URL/g)).toHaveLength(2);
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

describe("Dockerfile tools stage (migrations)", () => {
  const dockerfile = readRootFile("Dockerfile");
  const toolsStage = dockerfile.match(/^FROM .* AS tools\n([\s\S]*?)(?=^FROM )/m)?.[1] ?? "";

  it("applies tracked migrations instead of pushing the schema", () => {
    expect(toolsStage).toContain('CMD ["npx", "drizzle-kit", "migrate"]');
    expect(toolsStage).not.toContain("push");
  });

  it("ships the committed drizzle/ migrations in the image", () => {
    const ignored = (name) =>
      readRootFile(name)
        .split("\n")
        .map((line) => line.trim());
    expect(ignored(".dockerignore")).not.toContain("drizzle");
    expect(ignored(".gitignore")).not.toContain("/drizzle/");
    expect(ignored(".gitignore")).not.toContain("drizzle");
  });
});

describe("Node version", () => {
  const nodeMajor = readRootFile(".nvmrc").trim();

  it("pins a single major in .nvmrc", () => {
    expect(nodeMajor).toMatch(/^\d+$/);
  });

  it("takes Node from one base stage on that major, which every other stage builds on", () => {
    const froms = readRootFile("Dockerfile").match(/^FROM \S+( AS \S+)?$/gm) ?? [];
    const nodeFroms = froms.filter((line) => line.startsWith("FROM node:"));

    expect(nodeFroms).toEqual([`FROM node:${nodeMajor}-alpine AS base`]);
    expect(
      froms.filter((line) => !line.startsWith("FROM node:")).every((line) => line.startsWith("FROM base AS "))
    ).toBe(true);
  });

  it("runs CI on the version in .nvmrc instead of its own copy", () => {
    const workflow = readRootFile(".github/workflows/ci.yml");
    expect(workflow).toContain("node-version-file: .nvmrc");
    expect(workflow).not.toMatch(/node-version: /);
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
