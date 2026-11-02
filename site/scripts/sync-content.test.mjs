import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildChangelogPage,
  buildSelfHostingPage,
  copyBrandAssets,
  rewriteRelativeLinks,
  writeAppVersion,
} from "./sync-content.mjs";

const REPO_URL = "https://github.com/sdesmond/arrivo";

test("buildChangelogPage adds frontmatter and demotes headings below the page title", () => {
  const page = buildChangelogPage("# Changelog\n\n## [0.6.1] - 2026-11-02\n\n### Added\n\n- Thing\n");

  assert.match(page, /^---\ntitle: "Changelog"\n/);
  assert.doesNotMatch(page, /^# Changelog/m);
  assert.match(page, /^## \[0\.6\.1\] - 2026-11-02$/m);
  assert.match(page, /^### Added$/m);
});

test("buildChangelogPage keeps headings inside code fences untouched", () => {
  const page = buildChangelogPage("# Changelog\n\n```md\n# not a heading\n```\n");

  assert.match(page, /^# not a heading$/m);
});

test("rewriteRelativeLinks points repo files at GitHub", () => {
  const result = rewriteRelativeLinks("See [compose](../docker-compose.yml) and [docs](./other.md).", REPO_URL);

  assert.match(result, /\[compose\]\(https:\/\/github\.com\/sdesmond\/arrivo\/blob\/main\/docker-compose\.yml\)/);
  assert.match(result, /\[docs\]\(https:\/\/github\.com\/sdesmond\/arrivo\/blob\/main\/docs\/other\.md\)/);
});

test("rewriteRelativeLinks leaves absolute and anchor links alone", () => {
  const input = "[a](https://example.com) [b](#section) [c](mailto:x@y.z)";

  assert.equal(rewriteRelativeLinks(input, REPO_URL), input);
});

test("buildSelfHostingPage drops the H1 and adds frontmatter", () => {
  const page = buildSelfHostingPage("# Self-hosting Arrivo\n\nIntro.\n\n## HTTPS\n\nText.\n", REPO_URL);

  assert.match(page, /^---\ntitle: "Self-hosting Arrivo"\n/);
  assert.doesNotMatch(page, /^# Self-hosting Arrivo/m);
  assert.match(page, /^## HTTPS$/m);
  assert.match(page, /Generated from docs\/self-hosting\.md/);
});

test("frontmatter values stay valid YAML when they contain a colon", () => {
  const page = buildSelfHostingPage("# T\n\nBody\n", REPO_URL);
  const description = /^description: (.*)$/m.exec(page)?.[1] ?? "";

  assert.ok(description.startsWith('"') && description.endsWith('"'));
  assert.doesNotThrow(() => JSON.parse(description));
});

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "sync-content-"));
  const repoRoot = join(root, "repo");
  const siteRoot = join(repoRoot, "site");
  mkdirSync(join(repoRoot, "src", "assets"), { recursive: true });
  mkdirSync(siteRoot, { recursive: true });
  writeFileSync(join(repoRoot, "src", "assets", "arrivo-logo.svg"), "<svg>logo</svg>");
  writeFileSync(join(repoRoot, "src", "assets", "arrivo-text.svg"), "<svg>text</svg>");
  writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ name: "arrivo", version: "9.8.7" }));
  return { repoRoot, siteRoot };
}

test("copyBrandAssets copies the app's logo and wordmark so the site never keeps its own copy", () => {
  const { repoRoot, siteRoot } = makeRepo();

  copyBrandAssets(repoRoot, siteRoot);

  assert.equal(readFileSync(join(siteRoot, "src", "assets", "brand", "arrivo-logo.svg"), "utf8"), "<svg>logo</svg>");
  assert.equal(readFileSync(join(siteRoot, "src", "assets", "brand", "arrivo-text.svg"), "utf8"), "<svg>text</svg>");
});

test("copyBrandAssets fails loudly when an app asset is missing", () => {
  const { repoRoot, siteRoot } = makeRepo();
  writeFileSync(join(repoRoot, "src", "assets", "arrivo-logo.svg"), "");
  mkdirSync(join(repoRoot, "empty"), { recursive: true });

  assert.throws(() => copyBrandAssets(join(repoRoot, "empty"), siteRoot), /arrivo-logo\.svg/);
});

test("writeAppVersion records the app's package version for the home page", () => {
  const { repoRoot, siteRoot } = makeRepo();

  writeAppVersion(repoRoot, siteRoot);

  assert.deepEqual(JSON.parse(readFileSync(join(siteRoot, "src", "generated", "app-version.json"), "utf8")), {
    version: "9.8.7",
  });
});
