import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildLlmsFull,
  buildLlmsIndex,
  collectPages,
  EXCLUDED_PAGES,
  findUnlistedPages,
  PAGE_ORDER,
  parseFrontmatter,
  slugForFile,
  toPlainMarkdown,
} from "./build-llms.mjs";

const SITE_URL = "https://sdesmond.github.io/arrivo";
const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = join(SITE_ROOT, "src", "content", "docs");

function makeDocs(files) {
  const root = mkdtempSync(join(tmpdir(), "build-llms-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test("parseFrontmatter reads plain and JSON-quoted values and returns the body", () => {
  const { data, body } = parseFrontmatter('---\ntitle: Trips\ndescription: "Create: and delete."\n---\n\nHello\n');

  assert.equal(data.title, "Trips");
  assert.equal(data.description, "Create: and delete.");
  assert.equal(body.trim(), "Hello");
});

test("toPlainMarkdown drops MDX imports and comments", () => {
  const output = toPlainMarkdown(
    'import Screenshot from "../../components/Screenshot.astro";\n\n<!-- generated -->\n\nText\n',
    {
      siteUrl: SITE_URL,
    }
  );

  assert.equal(output.trim(), "Text");
});

test("toPlainMarkdown turns a screenshot component into its description", () => {
  const output = toPlainMarkdown('<Screenshot name="trips" alt="The Trips page with an active trip" />', {
    siteUrl: SITE_URL,
  });

  assert.equal(output.trim(), "*Screenshot: The Trips page with an active trip*");
});

test("toPlainMarkdown turns multi-line screenshot components into their description", () => {
  const output = toPlainMarkdown('<Screenshot\n  name="trips"\n  alt="A wrapped alt"\n/>', { siteUrl: SITE_URL });

  assert.equal(output.trim(), "*Screenshot: A wrapped alt*");
});

test("toPlainMarkdown turns asides into blockquotes with their title", () => {
  const output = toPlainMarkdown(
    ":::note[The map needs a token]\nSet `MAPBOX_ACCESS_TOKEN`.\n\nSecond paragraph.\n:::\n",
    {
      siteUrl: SITE_URL,
    }
  );

  assert.equal(output.trim(), "> **Note: The map needs a token.** Set `MAPBOX_ACCESS_TOKEN`.\n>\n> Second paragraph.");
});

test("toPlainMarkdown makes site links absolute and leaves external links alone", () => {
  const output = toPlainMarkdown("[a](/arrivo/guide/trips/) [b](https://example.com) [c](#top)", { siteUrl: SITE_URL });

  assert.equal(output.trim(), "[a](https://sdesmond.github.io/arrivo/guide/trips/) [b](https://example.com) [c](#top)");
});

test("toPlainMarkdown demotes headings by one level but not inside code fences", () => {
  const output = toPlainMarkdown("## Heading\n\n```sh\n# comment\n```\n\n### Sub\n", { siteUrl: SITE_URL });

  assert.match(output, /^### Heading$/m);
  assert.match(output, /^#### Sub$/m);
  assert.match(output, /^# comment$/m);
});

test("toPlainMarkdown rewrites definition lists as bullets", () => {
  const output = toPlainMarkdown("**Active**\n: A trip in progress.\n\n**Event**\n: A stop on a day.\n", {
    siteUrl: SITE_URL,
  });

  assert.equal(output.trim(), "- **Active**: A trip in progress.\n\n- **Event**: A stop on a day.");
});

test("slugForFile maps files to page slugs", () => {
  assert.equal(slugForFile("guide/trips.mdx"), "guide/trips");
  assert.equal(slugForFile("self-hosting/index.md"), "self-hosting");
  assert.equal(slugForFile("index.mdx"), "index");
});

test("collectPages returns listed pages in PAGE_ORDER with titles and plain bodies", () => {
  const docsDir = makeDocs({
    "get-started.mdx": "---\ntitle: Get started\ndescription: Begin.\n---\n\n## Step\n\nDo it.\n",
    "guide/trips.mdx": "---\ntitle: Trips\ndescription: About trips.\n---\n\nBody\n",
  });

  const pages = collectPages(docsDir, { order: ["guide/trips", "get-started"], siteUrl: SITE_URL });

  assert.deepEqual(
    pages.map((page) => [page.slug, page.title, page.url]),
    [
      ["guide/trips", "Trips", "https://sdesmond.github.io/arrivo/guide/trips/"],
      ["get-started", "Get started", "https://sdesmond.github.io/arrivo/get-started/"],
    ]
  );
  assert.match(pages[1].body, /^### Step$/m);
});

test("collectPages fails when a listed page is missing", () => {
  const docsDir = makeDocs({ "guide/trips.mdx": "---\ntitle: Trips\n---\n\nBody\n" });

  assert.throws(
    () => collectPages(docsDir, { order: ["guide/trips", "guide/gone"], siteUrl: SITE_URL }),
    /guide\/gone/
  );
});

test("findUnlistedPages reports docs pages that are neither ordered nor excluded", () => {
  const docsDir = makeDocs({
    "index.mdx": "---\ntitle: Home\n---\n",
    "guide/trips.mdx": "---\ntitle: Trips\n---\n",
    "guide/new-page.mdx": "---\ntitle: New\n---\n",
  });

  assert.deepEqual(findUnlistedPages(docsDir, { order: ["guide/trips"], excluded: ["index"] }), ["guide/new-page"]);
});

test("every real docs page is in the LLM guide or deliberately excluded", () => {
  assert.deepEqual(findUnlistedPages(DOCS_DIR, { order: PAGE_ORDER, excluded: EXCLUDED_PAGES }), []);
});

const SAMPLE_PAGES = [
  {
    slug: "get-started",
    title: "Get started",
    description: "Begin.",
    url: `${SITE_URL}/get-started/`,
    body: "Body one\n",
  },
  {
    slug: "guide/trips",
    title: "Trips",
    description: "About trips.",
    url: `${SITE_URL}/guide/trips/`,
    body: "Body two\n",
  },
  {
    slug: "changelog",
    title: "Changelog",
    description: "Releases.",
    url: `${SITE_URL}/changelog/`,
    body: "Body three\n",
  },
];

test("buildLlmsFull has a version header, the overview, then every page with its source URL", () => {
  const output = buildLlmsFull({
    pages: SAMPLE_PAGES,
    overview: "## How to use this document\n\nRules.\n",
    version: "1.2.3",
    siteUrl: SITE_URL,
  });

  assert.match(output, /^# Arrivo user guide for AI assistants\n/);
  assert.match(output, /Version 1\.2\.3/);
  assert.ok(output.indexOf("## How to use this document") < output.indexOf("## Get started"));
  assert.match(output, /## Trips\n\nSource: https:\/\/sdesmond\.github\.io\/arrivo\/guide\/trips\/\n\nBody two/);
  assert.ok(output.indexOf("## Trips") < output.indexOf("## Changelog"));
});

test("buildLlmsFull leaves no MDX or component syntax behind", () => {
  const output = buildLlmsFull({
    pages: SAMPLE_PAGES,
    overview: "## Overview\n",
    version: "1.2.3",
    siteUrl: SITE_URL,
  });

  assert.doesNotMatch(output, /^import /m);
  assert.doesNotMatch(output, /<Screenshot|<Card|<FeatureRow|:::/);
});

test("buildLlmsIndex follows the llms.txt shape and points at the full guide", () => {
  const output = buildLlmsIndex({ pages: SAMPLE_PAGES, version: "1.2.3", siteUrl: SITE_URL });

  assert.match(output, /^# Arrivo\n\n> /);
  assert.match(output, /- \[Get started\]\(https:\/\/sdesmond\.github\.io\/arrivo\/get-started\/\): Begin\./);
  assert.match(output, /- \[Trips\]\(https:\/\/sdesmond\.github\.io\/arrivo\/guide\/trips\/\): About trips\./);
  assert.match(output, /\[Full guide in one file\]\(https:\/\/sdesmond\.github\.io\/arrivo\/llms-full\.txt\)/);
});
