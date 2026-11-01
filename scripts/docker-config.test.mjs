import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = join(import.meta.dirname, "..");
const readRawRootFile = (name) => readFileSync(join(rootDir, name), "utf8");
// Normalize CRLF: Windows checkouts with core.autocrlf rewrite these files' line endings.
const readRootFile = (name) => readRawRootFile(name).replace(/\r\n/g, "\n");

// Returns the indented block for one top-level-service key, e.g. serviceBlock(compose, "db").
function serviceBlock(compose, service) {
  const match = compose.match(new RegExp(`^  ${service}:\\n((?:(?:    .*)?\\n)+)`, "m"));
  if (!match) throw new Error(`service "${service}" not found`);
  return match[1];
}

// Returns the body of one Dockerfile stage, e.g. dockerfileStage(dockerfile, "runner").
function dockerfileStage(dockerfile, stage) {
  return dockerfile.match(new RegExp(`^FROM .* AS ${stage}\\n([\\s\\S]*?)(?=^FROM |(?![\\s\\S]))`, "m"))?.[1] ?? "";
}

describe("docker-compose.yml (self-hosting stack)", () => {
  const compose = readRootFile("docker-compose.yml");

  it("runs just the database and the app; the app migrates itself on start", () => {
    expect(compose.match(/^ {2}\w[\w-]*:$/gm)).toEqual(["  db:", "  app:"]);
  });

  it("is self-contained, so it can be pasted into a stack tool without a .env file", () => {
    expect(compose).not.toContain("${");
    expect(existsSync(join(rootDir, ".env.docker.example"))).toBe(false);
  });

  it("pins Postgres 17 and restarts the database with the host", () => {
    const db = serviceBlock(compose, "db");
    expect(db).toContain("image: postgres:17-alpine");
    expect(db).toContain("restart: unless-stopped");
    expect(db).toContain("pg_isready -d arrivo -U arrivo");
  });

  it("stores data in host bind mounts under ./data", () => {
    expect(serviceBlock(compose, "db")).toContain("./data/pgdata:/var/lib/postgresql/data");
    expect(serviceBlock(compose, "app")).toContain("./data/storage:/app/storage");
    expect(compose).not.toMatch(/^volumes:/m);
  });

  it("pulls the published image instead of building", () => {
    expect(serviceBlock(compose, "app")).toContain("image: ghcr.io/sdesmond/arrivo:latest");
    expect(compose).not.toMatch(/^\s+build:/m);
  });

  it("starts the app once the database is healthy, on port 4850", () => {
    const app = serviceBlock(compose, "app");
    expect(app).toContain("condition: service_healthy");
    expect(app).toContain('"4850:4850"');
    expect(app).toContain("restart: unless-stopped");
  });

  it("sets the owner of the uploads folder with PUID/PGID", () => {
    const app = serviceBlock(compose, "app");
    expect(app).toMatch(/PUID: \d+/);
    expect(app).toMatch(/PGID: \d+/);
  });

  it("passes the Mapbox public token at runtime", () => {
    expect(serviceBlock(compose, "app")).toContain("MAPBOX_PUBLIC_TOKEN:");
  });

  it("needs no secret up front: the image generates and persists one", () => {
    expect(compose).not.toMatch(/^\s+NEXTAUTH_SECRET:/m);
  });
});

describe("docker-compose.build.yml (build-from-source override)", () => {
  const compose = readRootFile("docker-compose.build.yml");

  it("builds the runner target from the repo under a local image tag", () => {
    const app = serviceBlock(compose, "app");
    expect(app).toContain("image: arrivo-app:local");
    expect(app).toContain("target: runner");
    expect(compose).not.toMatch(/^ {2}migrate:/m);
  });
});

describe("Dockerfile", () => {
  const dockerfile = readRootFile("Dockerfile");
  const runner = dockerfileStage(dockerfile, "runner");

  it("has no separate tools stage", () => {
    expect(dockerfile).not.toMatch(/ AS tools$/m);
  });

  it("bundles the migrator and ships the committed drizzle/ migrations", () => {
    expect(dockerfileStage(dockerfile, "builder")).toContain("src/db/migrate-cli.ts");
    expect(runner).toMatch(/COPY --from=builder \/app\/dist\/migrate\.mjs/);
    expect(runner).toMatch(/COPY --from=builder \/app\/drizzle/);
    const lines = (name) =>
      readRootFile(name)
        .split("\n")
        .map((line) => line.trim());
    expect(lines(".dockerignore")).not.toContain("drizzle");
    expect(lines(".gitignore")).not.toContain("/drizzle/");
    expect(lines(".gitignore")).not.toContain("drizzle");
  });

  it("bundles the admin recovery tool and ships no immediate two-factor reset", () => {
    expect(dockerfileStage(dockerfile, "builder")).toContain("src/db/admin-recovery-main.ts");
    expect(runner).toMatch(/COPY --from=builder \/app\/dist\/admin-recovery\.mjs \.\/admin-recovery\.mjs/);
    expect(dockerfile).not.toMatch(/mfa-reset/);
    for (const stale of ["mfa-reset.ts", "mfa-reset-cli.ts", "mfa-reset.test.ts"])
      expect(existsSync(join(rootDir, "src/db", stale))).toBe(false);
  });

  it("listens on 4850 on all interfaces", () => {
    expect(runner).toMatch(/PORT=4850/);
    expect(runner).toMatch(/HOSTNAME=0\.0\.0\.0/);
    expect(runner).toContain("EXPOSE 4850");
  });

  it("bakes in the defaults compose would otherwise repeat", () => {
    expect(runner).toContain("AUTH_TRUST_HOST=true");
    expect(runner).toContain("STORAGE_PROVIDER=local");
    expect(runner).toContain("STORAGE_LOCAL_ROOT_DIR=/app/storage");
  });

  it("runs the entrypoint under tini and drops privileges with su-exec", () => {
    expect(runner).toMatch(/apk add --no-cache .*tini/);
    expect(runner).toMatch(/apk add --no-cache .*su-exec/);
    expect(runner).toContain('ENTRYPOINT ["/sbin/tini", "--", "/app/docker/entrypoint.sh"]');
    expect(runner).toContain('CMD ["node", "server.js"]');
  });

  it("health-checks the response body, since wget follows a sign-in redirect to a 200", () => {
    expect(runner).toMatch(/HEALTHCHECK .*http:\/\/127\.0\.0\.1:4850\/api\/health .*grep -q '"status":"ok"'/);
  });

  it("declares no VOLUME, which would create anonymous volumes", () => {
    expect(runner).not.toMatch(/^VOLUME/m);
  });

  // Node crashes intermittently under QEMU, so npm and next build run natively and only the runner is per-arch.
  it("builds on the build machine's platform and only assembles the runner per target", () => {
    expect(dockerfile).toMatch(/^FROM --platform=\$BUILDPLATFORM node:\S+ AS build-base$/m);
    expect(dockerfile).toMatch(/^FROM build-base AS deps$/m);
    expect(dockerfile).toMatch(/^FROM build-base AS builder$/m);
    expect(dockerfile).toMatch(/^FROM base AS runner$/m);
  });

  it("swaps the traced sharp binaries for the target arch's", () => {
    const builder = dockerfileStage(dockerfile, "builder");
    expect(builder).toContain("ARG TARGETARCH");
    expect(builder).toContain("rm -rf .next/standalone/node_modules/@img/sharp-");
    expect(builder).toContain('"sharp-linuxmusl-$arch" "sharp-libvips-linuxmusl-$arch"');
    expect(builder).toContain('npm pack "@img/$pkg@$version"');
  });
});

describe("docker/entrypoint.sh", () => {
  const entrypoint = readRootFile("docker/entrypoint.sh");

  it("is a strict POSIX shell script with LF line endings in every checkout", () => {
    expect(entrypoint.startsWith("#!/bin/sh\n")).toBe(true);
    expect(entrypoint).toContain("set -eu");
    expect(readRootFile(".gitattributes")).toMatch(/^\*\.sh text eol=lf$/m);
  });

  it("re-owns the storage folder to PUID:PGID and drops privileges", () => {
    expect(entrypoint).toContain('-exec chown "$PUID:$PGID"');
    expect(entrypoint).toContain("su-exec");
  });

  it("generates the auth secret once and persists it under the storage folder", () => {
    expect(entrypoint).toContain(".arrivo/auth-secret");
    expect(entrypoint).toContain("/dev/urandom");
    expect(entrypoint).toContain("export NEXTAUTH_SECRET");
  });

  it("generates the data encryption key once and persists it beside the auth secret", () => {
    expect(entrypoint).toContain(".arrivo/data-key");
    expect(entrypoint).toContain("export DATA_ENCRYPTION_KEY");
    expect(entrypoint.indexOf("export DATA_ENCRYPTION_KEY")).toBeLessThan(entrypoint.indexOf("migrate.mjs"));
  });

  it("migrates before exec-ing the server", () => {
    expect(entrypoint.indexOf("migrate.mjs")).toBeGreaterThan(-1);
    expect(entrypoint.indexOf("migrate.mjs")).toBeLessThan(entrypoint.lastIndexOf("exec "));
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
    expect(latestRules).toHaveLength(1);
    expect(latestRules[0]).toContain("!contains(github.ref_name, '-')");
  });

  it("builds the single app image for amd64 and arm64", () => {
    expect(workflow).toMatch(/images: ghcr\.io\/sdesmond\/arrivo$/m);
    expect(workflow).not.toContain("arrivo-migrate");
    expect(workflow).toContain("target: runner");
    expect(workflow).not.toContain("target: tools");
    expect(workflow.match(/platforms: linux\/amd64,linux\/arm64/g)).toHaveLength(1);
  });

  // Only the runner's apk add and file copies run under QEMU now, so a hang should fail fast.
  it("times out well before a hung emulated build would", () => {
    const timeout = Number(workflow.match(/timeout-minutes: (\d+)/)?.[1]);
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(30);
  });
});

describe("ci workflow (migration safety)", () => {
  const workflow = readRootFile(".github/workflows/ci.yml");

  // Branches must be up to date before merging (ruleset), so a post-merge run would re-test the same tree.
  it("runs on pull requests only", () => {
    expect(workflow).toContain("pull_request:");
    expect(workflow).not.toMatch(/^\s+push:/m);
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

  it("applies migrations from source to an empty Postgres 17 twice", () => {
    expect(workflow.match(/image: postgres:17-alpine/g)).toHaveLength(1);
    expect(workflow.match(/run: npm run db:migrate$/gm)).toHaveLength(2);
  });

  it("smoke-tests the real compose stack built from source", () => {
    expect(workflow).toMatch(/^ {2}docker-smoke:$/m);
    expect(workflow).not.toMatch(/^ {2}migrate-image:$/m);
    expect(workflow).toContain("COMPOSE_FILE: docker-compose.yml:docker-compose.build.yml");
    expect(workflow).toContain("docker compose up -d --wait");
  });

  it("checks health unauthenticated without following redirects, so a sign-in redirect fails", () => {
    expect(workflow).toContain("--max-redirs 0");
    expect(workflow).toContain("http://localhost:4850/api/health");
  });

  it("checks the sign-in redirect uses the browser's Host, not the server's listen address", () => {
    expect(workflow).toContain("-H 'Host: 192.168.1.50:4850'");
    expect(workflow).toContain("http://192.168.1.50:4850/sign-in");
  });

  it("restarts the app and checks the generated secret survives", () => {
    expect(workflow).toContain("docker compose restart app");
    expect(workflow).toContain(".arrivo/auth-secret");
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
    expect(compose).toMatch(/^volumes:\n {2}pgdata:/m);
  });
});

describe("Node version", () => {
  const nodeMajor = readRootFile(".nvmrc").trim();

  it("pins a single major in .nvmrc", () => {
    expect(nodeMajor).toMatch(/^\d+$/);
  });

  it("takes Node from the base stages on that major, which every other stage builds on", () => {
    const froms = readRootFile("Dockerfile").match(/^FROM .*$/gm) ?? [];
    const nodeFroms = froms.filter((line) => / node:/.test(line));

    expect(nodeFroms).toEqual([
      `FROM node:${nodeMajor}-alpine AS base`,
      `FROM --platform=$BUILDPLATFORM node:${nodeMajor}-alpine AS build-base`,
    ]);
    expect(
      froms.filter((line) => !/ node:/.test(line)).every((line) => /^FROM (base|build-base) AS \S+$/.test(line))
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
    expect(readRootFile(".dockerignore").split("\n")).toContain("data");
  });

  it("documents the Postgres major and port the stack runs", () => {
    const doc = readRootFile("docs/self-hosting.md");
    expect(doc).toContain("PostgreSQL 17");
    expect(doc).toContain("4850");
  });
});
