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

test("findBrokenLinks ignores external, same-page anchor and asset links", () => {
  const pages = new Map([
    [
      "index.html",
      '<a href="https://example.com">x</a><a href="#top">y</a><a href="/arrivo/guide/trips/#roles">z</a><link href="/arrivo/favicon.svg">',
    ],
    ["guide/trips/index.html", '<h2 id="roles">Roles</h2>'],
    ["favicon.svg", ""],
  ]);

  assert.deepEqual(findBrokenLinks(pages, BASE), []);
});

test("findBrokenLinks flags fragments with no matching heading id", () => {
  const pages = new Map([
    ["index.html", '<a href="/arrivo/guide/trips/#roles">ok</a><a href="/arrivo/guide/trips/#nope">bad</a>'],
    ["guide/trips/index.html", '<h2 id="roles">Roles</h2>'],
  ]);

  assert.deepEqual(findBrokenLinks(pages, BASE), [{ page: "index.html", href: "/arrivo/guide/trips/#nope" }]);
});
