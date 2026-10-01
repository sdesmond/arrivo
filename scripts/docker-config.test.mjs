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
    expect(db).toContain("pg_isready -d packt -U packt");
  });

  it("stores data in host bind mounts under PACKT_DATA_DIR", () => {
    expect(serviceBlock(compose, "db")).toContain("${PACKT_DATA_DIR:-./data}/pgdata:/var/lib/postgresql/data");
    expect(serviceBlock(compose, "app")).toContain("${PACKT_DATA_DIR:-./data}/storage:/app/storage");
    expect(compose).not.toMatch(/^volumes:/m);
  });

  it("builds fixed image names from a configurable source dir", () => {
    const migrate = serviceBlock(compose, "migrate");
    const app = serviceBlock(compose, "app");
    expect(migrate).toContain("image: packt-migrate:local");
    expect(app).toContain("image: packt-app:local");
    expect(migrate).toContain("context: ${PACKT_SRC_DIR:-.}");
    expect(app).toContain("context: ${PACKT_SRC_DIR:-.}");
  });

  it("runs migrate once and starts the app only after it succeeds", () => {
    expect(serviceBlock(compose, "migrate")).toContain('restart: "no"');
    expect(serviceBlock(compose, "app")).toContain("condition: service_completed_successfully");
    expect(serviceBlock(compose, "app")).toContain(":3000");
  });
});

describe("docker-compose.dev.yml (local dev database)", () => {
  const compose = readRootFile("docker-compose.dev.yml");

  it("uses its own project name so it never replaces the self-hosting stack's db", () => {
    expect(compose).toMatch(/^name: packt-dev$/m);
  });

  it("uses the same Postgres major as the self-hosting stack", () => {
    expect(serviceBlock(compose, "db")).toContain("image: postgres:17-alpine");
  });

  it("publishes 5432 for host-side dev tooling and keeps data in a named volume", () => {
    const db = serviceBlock(compose, "db");
    expect(db).toContain('"5432:5432"');
    expect(db).toContain("packt-dev-pgdata:/var/lib/postgresql/data");
    expect(compose).toMatch(/^volumes:\n  packt-dev-pgdata:/m);
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
