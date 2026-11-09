/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// Every `/api/v1` route handler must be built with `apiRoute` (auth, CSRF, validation, rate limit, error envelope).
// The scan is source-text based, so it never imports a route and has no database or auth side effects.

const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

interface Offender {
  name: string;
  problem: string;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function importsApiRoute(source: string): boolean {
  return /import\s*\{[^}]*\bapiRoute\b(?!\s+as\b)[^}]*\}\s*from\s*["']@\/lib\/api\/route["']/.test(source);
}

/** Returns every export that is not an HTTP-method const built with the real `apiRoute`. */
function scanRouteSource(source: string): Offender[] {
  const code = stripComments(source);
  const offenders: Offender[] = [];
  const wrapperImported = importsApiRoute(code);

  for (const match of code.matchAll(/export\s+(?:async\s+)?function\s*\*?\s*(\w+)/g)) {
    offenders.push({ name: match[1], problem: "exported function is not wrapped in apiRoute" });
  }
  for (const match of code.matchAll(/export\s+(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*([^;]*)/g)) {
    const [, name, initializer] = match;
    for (const later of initializer.matchAll(/,\s*(\w+)\s*(?::[^=,]+)?=(?![=>])/g)) {
      if (HTTP_METHODS.includes(later[1])) {
        offenders.push({ name: later[1], problem: "handler in a multi-declarator export is not built with apiRoute" });
      }
    }
    if (!HTTP_METHODS.includes(name)) continue;
    if (!wrapperImported || !/^apiRoute\s*(?:<[^>]*>)?\s*\(/.test(initializer.trimStart())) {
      offenders.push({ name, problem: "handler is not built with apiRoute imported from @/lib/api/route" });
    }
  }
  for (const match of code.matchAll(/export\s+(?:const|let|var)\s*([{[])/g)) {
    offenders.push({ name: `destructured ${match[1]}`, problem: "destructured exports bypass apiRoute" });
  }
  for (const match of code.matchAll(/export\s*\{([^}]*)\}/g)) {
    offenders.push({ name: match[1].trim(), problem: "re-exported handlers bypass apiRoute" });
  }
  for (const match of code.matchAll(/export\s*\*(?:\s+as\s+(\w+))?\s*from/g)) {
    offenders.push({ name: match[1] ?? "*", problem: "star re-export bypasses apiRoute" });
  }
  if (/export\s+default\b/.test(code)) {
    offenders.push({ name: "default", problem: "default export is not a wrapped handler" });
  }
  return offenders;
}

/**
 * The only v1 routes allowed to skip `apiRoute`: path, the reason, and the exact handlers exempted. Any other unwrapped
 * export in the file, or a stale entry (route gone, now wrapped, or handler removed), fails.
 * Mobile token endpoints join this list in a later phase.
 */
const EXEMPT: Record<string, { reason: string; handlers: string[] }> = {
  "src/app/api/v1/meta/route.ts": {
    reason:
      "Public unauthenticated GET that lets clients discover the API version before signing in; apiRoute is auth-first and POST-only.",
    handlers: ["GET"],
  },
};

describe("scanRouteSource", () => {
  it("accepts handlers built with apiRoute", () => {
    const source = `
      import { apiRoute } from "@/lib/api/route";
      import { endpoint } from "@/lib/api/contract/x";
      export const dynamic = "force-dynamic";
      export const POST = apiRoute(endpoint, ({ actor }) => actor);
      export const PATCH = apiRoute<Thing>(
        endpoint,
        () => 1,
        { idempotent: {} }
      );
    `;
    expect(scanRouteSource(source)).toEqual([]);
  });

  it.each([
    ["function", `export function GET() { return Response.json({}); }`, "GET"],
    ["async function", `export async function POST(request: Request) { return Response.json({}); }`, "POST"],
    [
      "other call",
      `import { apiRoute } from "@/lib/api/route";\nexport const DELETE = somethingElse(endpoint, () => 1);`,
      "DELETE",
    ],
    ["re-export", `export { POST } from "./other";`, "POST"],
    ["local re-export", `const POST = () => 1;\nexport { POST };`, "POST"],
    ["star re-export", `export * from "./other";`, "*"],
    ["default export", `export default function handler() {}`, "default"],
    [
      "aliased import",
      `import { apiRoute as wrap } from "@/lib/api/route";\nexport const POST = wrap(endpoint, () => 1);`,
      "POST",
    ],
    [
      "aliased import hiding a local apiRoute",
      `import { apiRoute as wrap } from "@/lib/api/route";\nexport const POST = apiRoute(endpoint, () => 1);`,
      "POST",
    ],
    ["destructured export", `export const { GET } = handlers;`, "destructured {"],
    [
      "unwrapped later declarator",
      `import { apiRoute } from "@/lib/api/route";\nexport const dynamic = "force-dynamic", POST = async () => Response.json({});`,
      "POST",
    ],
    [
      "unwrapped declarator after a wrapped one",
      `import { apiRoute } from "@/lib/api/route";\nexport const POST = apiRoute(endpoint, () => 1), GET = other();`,
      "GET",
    ],
    ["wrong module", `import { apiRoute } from "./fake";\nexport const POST = apiRoute(endpoint, () => 1);`, "POST"],
    [
      "missing import",
      `const apiRoute = (...args: unknown[]) => args;\nexport const PUT = apiRoute(endpoint, () => 1);`,
      "PUT",
    ],
  ])("flags %s", (_label, source, name) => {
    expect(scanRouteSource(source).map((offender) => offender.name)).toContain(name);
  });

  it("ignores commented-out exports", () => {
    const source = `
      import { apiRoute } from "@/lib/api/route";
      // export function GET() {}
      /* export const POST = other(); */
      export const PATCH = apiRoute(endpoint, () => 1);
    `;
    expect(scanRouteSource(source)).toEqual([]);
  });
});

describe("api v1 handler coverage", () => {
  const routes = import.meta.glob("/src/app/api/v1/**/route.{ts,tsx,js,jsx,mjs}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const files = Object.keys(routes)
    .map((path) => path.replace(/^\//, ""))
    .sort();
  const sourceOf = (file: string) => routes[`/${file}`];

  it("finds the v1 route files", () => {
    expect(files).toContain("src/app/api/v1/checklist-items/[itemId]/route.ts");
    expect(files).toContain("src/app/api/v1/checklists/[checklistId]/items/route.ts");
  });

  it("wraps every handler in apiRoute unless explicitly exempt", () => {
    const failures = files
      .filter((file) => !(file in EXEMPT))
      .flatMap((file) =>
        scanRouteSource(sourceOf(file)).map((offender) => `${file} ${offender.name}: ${offender.problem}`)
      );
    expect(failures, `Unwrapped v1 handlers:\n${failures.join("\n")}`).toEqual([]);
  });

  it("keeps every exemption justified and live", () => {
    const stale = Object.entries(EXEMPT).filter(
      ([file, { reason, handlers }]) =>
        !reason.trim() ||
        !files.includes(file) ||
        scanRouteSource(sourceOf(file))
          .map((offender) => offender.name)
          .sort()
          .join() !== [...handlers].sort().join()
    );
    expect(
      stale.map(([file]) => file),
      "Stale or unjustified exemptions"
    ).toEqual([]);
  });
});
