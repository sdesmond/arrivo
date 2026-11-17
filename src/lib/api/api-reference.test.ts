/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import reference from "../../../docs/api-v1.md?raw";
import type { Endpoint } from "./endpoint";

// Keeps docs/api-v1.md in step with the code: every v1 route is documented under a `### METHOD path` heading, nothing
// else is, and each section's `Idempotency-Key` line matches whether the route opts in to replay.

interface RouteEntry {
  key: string;
  idempotent: boolean;
}

const routeSources = import.meta.glob("/src/app/api/v1/**/route.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const contractModules = import.meta.glob(["./contract/*.ts", "!./contract/*.test.ts"], { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

/** `/src/app/api/v1/days/[dayId]/order/route.ts` → `/api/v1/days/:dayId/order`. */
function routePath(file: string): string {
  return file
    .replace(/^\/src\/app/, "")
    .replace(/\/route\.ts$/, "")
    .replace(/\[(\w+)\]/g, ":$1");
}

function routeEntries(): RouteEntry[] {
  const entries: RouteEntry[] = [];
  for (const [file, source] of Object.entries(routeSources)) {
    const path = routePath(file);
    const exports = [...source.matchAll(/export (?:const|(?:async )?function) (GET|POST|PUT|PATCH|DELETE)\b/g)];
    exports.forEach((match, index) => {
      const end = exports[index + 1]?.index ?? source.length;
      const declaration = source.slice(match.index, end);
      entries.push({ key: `${match[1]} ${path}`, idempotent: /\bidempotent\s*:/.test(declaration) });
    });
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key));
}

function contractKeys(): string[] {
  const keys: string[] = [];
  for (const exported of Object.values(contractModules)) {
    for (const value of Object.values(exported)) {
      if (value === null || typeof value !== "object" || !("method" in value) || !("path" in value)) continue;
      const endpoint = value as Endpoint<unknown, never, never>;
      keys.push(`${endpoint.method} ${endpoint.path}`);
    }
  }
  return keys.sort();
}

/** Each documented endpoint section: its heading key and the text up to the next heading. */
function documentedSections(): Map<string, string> {
  const sections = new Map<string, string>();
  const headings = [...reference.matchAll(/^#{2,3} (GET|POST|PUT|PATCH|DELETE) (\/api\/v1\S*)$/gm)];
  headings.forEach((match, index) => {
    const start = match.index + match[0].length;
    const rest = reference.slice(start);
    const nextHeading = rest.search(/^#{1,3} /m);
    const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    sections.set(`${match[1]} ${match[2]}`, body);
  });
  return sections;
}

describe("docs/api-v1.md", () => {
  const routes = routeEntries();
  const sections = documentedSections();

  it("finds the routes and the documented endpoints", () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(sections.size).toBeGreaterThan(20);
  });

  it("names every contract endpoint as a route, and only the meta route has no contract", () => {
    const withoutMeta = routes.map((route) => route.key).filter((key) => key !== "GET /api/v1/meta");
    expect(contractKeys()).toEqual(withoutMeta);
  });

  it("documents every route and nothing that is not one", () => {
    expect([...sections.keys()].sort()).toEqual(routes.map((route) => route.key));
  });

  it("states whether each route accepts Idempotency-Key, matching the route", () => {
    const mismatches = routes.flatMap((route) => {
      const stated = /`Idempotency-Key`\*\*:? (yes|no)\b/.exec(sections.get(route.key) ?? "")?.[1];
      const expected = route.idempotent ? "yes" : "no";
      return stated === expected ? [] : [`${route.key}: documented ${stated ?? "nothing"}, route says ${expected}`];
    });
    expect(mismatches).toEqual([]);
  });
});
