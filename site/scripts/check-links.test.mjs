import assert from "node:assert/strict";
import { test } from "node:test";

import { findBrokenLinks } from "./check-links.mjs";

const BASE = "/arrivo";

test("findBrokenLinks flags internal links with no matching page", () => {
  const pages = new Map([
    ["index.html", '<a href="/arrivo/guide/trips/">ok</a><a href="/arrivo/missing/">bad</a>'],
    ["guide/trips/index.html", "<h1>Trips</h1>"],
  ]);

  assert.deepEqual(findBrokenLinks(pages, BASE), [{ page: "index.html", href: "/arrivo/missing/" }]);
});

test("findBrokenLinks ignores external, anchor and asset links, and strips fragments", () => {
  const pages = new Map([
    [
      "index.html",
      '<a href="https://example.com">x</a><a href="#top">y</a><a href="/arrivo/guide/trips/#roles">z</a><link href="/arrivo/favicon.svg">',
    ],
    ["guide/trips/index.html", ""],
    ["favicon.svg", ""],
  ]);

  assert.deepEqual(findBrokenLinks(pages, BASE), []);
});
