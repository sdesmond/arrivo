import { describe, expect, it } from "vitest";
import { buildPacket, checkTests, classifyFile, findSecrets, parseDiff, scopeStats } from "./checks.mjs";

// Builds a unified diff for one file. `lines` are added lines; `removed` are removed lines.
function fileDiff(path, { lines = [], removed = [], status = "modified", oldPath } = {}) {
  const header = [`diff --git a/${oldPath ?? path} b/${path}`];
  if (status === "added") header.push("new file mode 100644");
  if (status === "deleted") header.push("deleted file mode 100644");
  if (status === "renamed") header.push("similarity index 90%", `rename from ${oldPath}`, `rename to ${path}`);
  if (status === "binary") return [...header, `Binary files a/${path} and b/${path} differ`, ""].join("\n");
  header.push(`--- ${status === "added" ? "/dev/null" : `a/${oldPath ?? path}`}`);
  header.push(`+++ ${status === "deleted" ? "/dev/null" : `b/${path}`}`);
  header.push(`@@ -1,${removed.length + 1} +1,${lines.length + 1} @@`);
  header.push(" context");
  removed.forEach((text) => header.push(`-${text}`));
  lines.forEach((text) => header.push(`+${text}`));
  return header.join("\n") + "\n";
}

function parse(...diffs) {
  return parseDiff(diffs.join(""));
}

describe("parseDiff", () => {
  it("returns path, status, counts and numbered added lines", () => {
    const [file] = parse(fileDiff("src/lib/a.ts", { lines: ["one", "two"], removed: ["old"] }));

    expect(file).toMatchObject({ path: "src/lib/a.ts", status: "modified", additions: 2, deletions: 1 });
    expect(file.addedLines).toEqual([
      { line: 2, text: "one" },
      { line: 3, text: "two" },
    ]);
  });

  it("marks added, deleted, renamed and binary files", () => {
    const files = parse(
      fileDiff("src/new.ts", { status: "added", lines: ["x"] }),
      fileDiff("src/gone.ts", { status: "deleted", removed: ["x"] }),
      fileDiff("src/b.ts", { status: "renamed", oldPath: "src/a.ts" }),
      fileDiff("public/logo.png", { status: "binary" })
    );

    expect(files.map((file) => file.status)).toEqual(["added", "deleted", "renamed", "binary"]);
    expect(files[2].oldPath).toBe("src/a.ts");
    expect(files[3].binary).toBe(true);
  });

  it("returns an empty list for an empty diff", () => {
    expect(parseDiff("")).toEqual([]);
  });

  it("ignores `+++` header lines when collecting added lines", () => {
    const [file] = parse(fileDiff("src/a.ts", { lines: ["++counter"] }));

    expect(file.addedLines.map((entry) => entry.text)).toEqual(["++counter"]);
  });
});

describe("classifyFile", () => {
  it.each([
    ["package-lock.json", "noise"],
    ["drizzle/0004_cool.sql", "noise"],
    ["drizzle/meta/0004_snapshot.json", "noise"],
    ["src/image-types.d.ts", "noise"],
    ["public/logo.png", "noise"],
    ["src/app/fonts/dm-sans.woff2", "noise"],
    [".env.example", "noise"],
    ["src/lib/format.test.ts", "test"],
    ["src/components/arrivo/card.test.tsx", "test"],
    ["scripts/setup-dev.test.mjs", "test"],
    ["tests/e2e/features/day-planning.feature", "test"],
    ["tests/e2e/steps/day-planning.steps.ts", "test"],
    ["docs/releasing.md", "doc"],
    ["_bmad-output/planning-artifacts/prd.md", "doc"],
    [".agents/memories/MEMORY.md", "doc"],
    [".github/workflows/ci.yml", "config"],
    ["Dockerfile", "config"],
    ["vitest.config.mts", "config"],
    ["package.json", "config"],
    ["src/components/ui/button.tsx", "ui"],
    ["src/data/types.ts", "types"],
    ["src/components/arrivo/index.ts", "barrel"],
    ["evals/pr-reviewer/run-eval.mjs", "tooling"],
    ["evals/pr-reviewer/build-cases.mjs", "tooling"],
    ["src/lib/format.ts", "source"],
    ["src/app/(app)/trips/page.tsx", "source"],
    ["scripts/setup-dev.mjs", "source"],
  ])("%s is %s", (path, kind) => {
    expect(classifyFile(path)).toBe(kind);
  });
});

describe("findSecrets", () => {
  function secretsIn(line, path = "src/lib/a.ts") {
    return findSecrets(parse(fileDiff(path, { lines: [line] })));
  }

  // Secret-shaped fixtures are assembled at runtime so this file never contains a scannable literal.
  const stripe = ["sk_", "live_4eC39HqLyjWDarjtT1zdp7dc"].join("");
  const aws = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
  const github = ["gh", "p_abcdefghijklmnopqrstuvwxyz0123456789"].join("");
  const pem = ["-----BEGIN RSA ", "PRIVATE KEY-----"].join("");
  const dbUrl = ["postgres:/", "/admin:Sup3rS3cretPw@db.internal.example.com:5432/app"].join("");
  const jwt = ["eyJ", "hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36"].join("");

  it.each([
    ["stripe key", `const key = "${stripe}";`],
    ["aws key id", `const id = "${aws}";`],
    ["github token", `const value = "${github}";`],
    ["private key header", `const pem = \`${pem}`],
    ["jwt", `const session = "${jwt}";`],
    ["credentials in a url", `const url = "${dbUrl}";`],
    ["literal api key", 'const apiKey = "7f3a9c1e5b2d48a6b0c9e1f4a7d2c8b3";'],
    ["literal password", 'const DEFAULT_ADMIN_PASSWORD = "Tr0ub4dor&3xyzQ9";'],
    ["literal token with prefix", 'const apiToken = "tk_prod_9d8f7a6b5c4e3d2f1a0b9c8d7e6f5a4b";'],
    ["yaml secret", 'secret: "abcd1234efgh5678"'],
  ])("flags %s", (_name, line) => {
    const findings = secretsIn(line);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ path: "src/lib/a.ts", line: 2 });
  });

  it.each([
    ["type annotation", "type Credentials = { token: string; password: string };"],
    ["env read", "const apiKey = process.env.MAPBOX_API_KEY;"],
    ["form read", 'const password = String(formData.get("password") ?? "");'],
    ["commit sha", 'const BUILD_COMMIT = "9fceb02d0ae598e95dc970b74767f19372d61af8";'],
    ["placeholder", 'const apiKey = "changeme-changeme";'],
    ["template reference", 'const token = "${{ secrets.GITHUB_TOKEN }}";'],
    ["short value", 'const token = "abc";'],
    ["env example line", 'const EXAMPLE_ENV = "AUTH_SECRET=changeme";'],
    ["local dev connection string", 'const url = "postgres://arrivo:arrivo@localhost:5432/arrivo";'],
  ])("does not flag %s", (_name, line) => {
    expect(secretsIn(line)).toEqual([]);
  });

  it("only scans added lines", () => {
    const files = parse(fileDiff("src/lib/a.ts", { lines: ["const ok = 1;"], removed: [`const old = "${stripe}";`] }));

    expect(findSecrets(files)).toEqual([]);
  });

  it("skips noise files such as lockfiles", () => {
    expect(secretsIn(`"integrity": "${stripe}"`, "package-lock.json")).toEqual([]);
  });

  it("uses only high-confidence patterns in test files", () => {
    expect(secretsIn('const password = "hunter2hunter2";', "src/lib/a.test.ts")).toEqual([]);
    expect(secretsIn(`const key = "${stripe}";`, "src/lib/a.test.ts")).toHaveLength(1);
  });

  it("skips the generic assignment scan in seed, fixture and mock files but keeps the high-confidence patterns", () => {
    for (const path of [
      "src/db/seed-inserts-accounts.ts",
      "tests/support/fixtures/users.ts",
      "src/lib/mocks/auth.ts",
      "evals/pr-reviewer/build-cases.mjs",
    ]) {
      expect(secretsIn('export const SEED_PASSWORD = "demo1234";', path)).toEqual([]);
      expect(secretsIn(`const key = "${stripe}";`, path)).toHaveLength(1);
    }
  });

  it("reports the pattern name and never the secret value", () => {
    const [finding] = secretsIn(`const key = "${stripe}";`);

    expect(finding.pattern).toBe("stripe-live-key");
    expect(JSON.stringify(finding)).not.toContain(stripe);
  });

  it("reports each line once even when several patterns match", () => {
    expect(secretsIn(`const apiKey = "${stripe}";`)).toHaveLength(1);
  });
});

describe("checkTests", () => {
  it("passes when a colocated test changes with the source", () => {
    const files = parse(
      fileDiff("src/lib/format.ts", { lines: ["x"] }),
      fileDiff("src/lib/format.test.ts", { lines: ["y"] })
    );

    expect(checkTests(files)).toEqual({ status: "PASS", missing: [], review: [] });
  });

  it("passes for docs-only, config-only and deletion-only changes", () => {
    const files = parse(
      fileDiff("docs/a.md", { lines: ["x"] }),
      fileDiff(".github/workflows/ci.yml", { lines: ["x"] }),
      fileDiff("src/lib/gone.ts", { status: "deleted", removed: ["x"] }),
      fileDiff("src/data/types.ts", { lines: ["x"] }),
      fileDiff("src/components/ui/button.tsx", { lines: ["x"] }),
      fileDiff("src/components/arrivo/index.ts", { lines: ["x"] })
    );

    expect(checkTests(files).status).toBe("PASS");
  });

  it("fails when a source file changes and no test changes at all", () => {
    const files = parse(fileDiff("src/lib/format.ts", { lines: ["x"] }));

    expect(checkTests(files)).toEqual({ status: "FAIL", missing: ["src/lib/format.ts"], review: [] });
  });

  it("fails when a src/lib file changes without a test in its own directory", () => {
    const files = parse(
      fileDiff("src/lib/format.ts", { lines: ["x"] }),
      fileDiff("src/components/arrivo/card.test.tsx", { lines: ["y"] })
    );

    expect(checkTests(files)).toMatchObject({ status: "FAIL", missing: ["src/lib/format.ts"] });
  });

  it("fails when a src/components/arrivo file changes without a test in its own directory", () => {
    const files = parse(
      fileDiff("src/components/arrivo/card.tsx", { lines: ["x"] }),
      fileDiff("src/lib/format.test.ts", { lines: ["y"] })
    );

    expect(checkTests(files)).toMatchObject({ status: "FAIL", missing: ["src/components/arrivo/card.tsx"] });
  });

  it("treats any test in the same directory as covering the area", () => {
    const files = parse(
      fileDiff("src/components/packt/place-row-action-bar.tsx", { lines: ["x"] }),
      fileDiff("src/components/packt/place-row.test.tsx", { lines: ["y"] })
    );

    expect(checkTests(files).status).toBe("PASS");
  });

  it("lets an e2e feature or step cover src/app and component changes", () => {
    const files = parse(
      fileDiff("src/app/(app)/trips/page-client.tsx", { lines: ["x"] }),
      fileDiff("tests/e2e/features/trips.feature", { lines: ["y"] })
    );

    expect(checkTests(files).status).toBe("PASS");
  });

  it("sends uncovered non-strict sources to review when other tests changed", () => {
    const files = parse(
      fileDiff("src/app/(auth)/layout.tsx", { lines: ["x"] }),
      fileDiff("src/components/arrivo/brand.test.tsx", { lines: ["y"] })
    );

    expect(checkTests(files)).toEqual({ status: "REVIEW", missing: [], review: ["src/app/(auth)/layout.tsx"] });
  });

  it("fails an uncovered source outside the strict directories when no test changed", () => {
    const files = parse(fileDiff("src/app/layout.tsx", { lines: ["x"] }));

    expect(checkTests(files).status).toBe("FAIL");
  });

  it("fails when schema.ts changes without a migration", () => {
    const files = parse(
      fileDiff("src/db/schema.ts", { lines: ["x"] }),
      fileDiff("src/db/schema.test.ts", { lines: ["y"] })
    );

    expect(checkTests(files)).toMatchObject({ status: "FAIL", missing: ["src/db/schema.ts (no drizzle/ migration)"] });
  });

  it("passes when schema.ts changes with a migration", () => {
    const files = parse(
      fileDiff("src/db/schema.ts", { lines: ["x"] }),
      fileDiff("src/db/schema.test.ts", { lines: ["y"] }),
      fileDiff("drizzle/0005_new.sql", { status: "added", lines: ["z"] })
    );

    expect(checkTests(files).status).toBe("PASS");
  });

  it("lists at most ten missing files", () => {
    const files = parse(
      ...Array.from({ length: 12 }, (_unused, index) => fileDiff(`src/lib/file${index}.ts`, { lines: ["x"] }))
    );

    expect(checkTests(files).missing).toHaveLength(10);
  });
});

describe("scopeStats", () => {
  it("counts significant lines excluding noise, tests and docs, and lists top-level areas", () => {
    const stats = scopeStats(
      parse(
        fileDiff("src/lib/a.ts", { lines: ["1", "2", "3"], removed: ["0"] }),
        fileDiff("src/lib/a.test.ts", { lines: ["1", "2", "3", "4", "5"] }),
        fileDiff("package-lock.json", { lines: ["1", "2", "3", "4", "5", "6"] }),
        fileDiff("docs/a.md", { lines: ["1"] }),
        fileDiff(".github/workflows/ci.yml", { lines: ["1"] })
      )
    );

    expect(stats).toEqual({
      files: 5,
      additions: 16,
      deletions: 1,
      significantLines: 5,
      areas: ["src/lib", ".github"],
    });
  });
});

describe("buildPacket", () => {
  const files = parse(fileDiff("src/lib/a.ts", { lines: ["1", "2"] }), fileDiff("package-lock.json", { lines: ["1"] }));

  it("contains title, body, stats and file paths but never diff content", () => {
    const packet = buildPacket({ title: "Fix thing", body: "Because reasons.", files, tests: checkTests(files) });

    expect(packet).toContain("Title: Fix thing");
    expect(packet).toContain("Because reasons.");
    expect(packet).toContain("src/lib/a.ts (+2 -0)");
    expect(packet).not.toContain("package-lock.json (");
    expect(packet).toContain("1 noise file");
    expect(packet).not.toContain("context");
  });

  it("marks an empty body", () => {
    expect(buildPacket({ title: "t", body: "", files, tests: checkTests(files) })).toContain("(empty)");
  });

  it("truncates a long body and says so", () => {
    const packet = buildPacket({ title: "t", body: "x".repeat(5000), files, tests: checkTests(files) });

    expect(packet).toContain("[body truncated]");
    expect(packet.length).toBeLessThan(3500);
  });

  it("caps the file list and reports how many were omitted", () => {
    const many = parse(
      ...Array.from({ length: 90 }, (_unused, index) => fileDiff(`src/lib/f${index}.ts`, { lines: ["x"] }))
    );

    const packet = buildPacket({ title: "t", body: "b", files: many, tests: checkTests(many) });

    expect(packet).toContain("30 more files omitted");
  });

  it("lists uncovered source files for the tests judgment only when review is needed", () => {
    const reviewFiles = parse(
      fileDiff("src/app/(auth)/layout.tsx", { lines: ["x"] }),
      fileDiff("src/components/arrivo/brand.test.tsx", { lines: ["y"] })
    );

    const withReview = buildPacket({ title: "t", body: "b", files: reviewFiles, tests: checkTests(reviewFiles) });
    const without = buildPacket({ title: "t", body: "b", files, tests: { status: "PASS", missing: [], review: [] } });

    expect(withReview).toContain("Source files without a same-area test");
    expect(withReview).toContain("src/app/(auth)/layout.tsx");
    expect(withReview).toContain("Changed tests:");
    expect(without).not.toContain("Source files without a same-area test");
  });
});
