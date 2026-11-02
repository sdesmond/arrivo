import assert from "node:assert/strict";
import { test } from "node:test";

import { buildChangelogPage, buildSelfHostingPage, rewriteRelativeLinks } from "./sync-content.mjs";

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
