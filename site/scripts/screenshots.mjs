// Regenerates the docs screenshots from a running dev server seeded with `npm run db:seed`
// (accounts and trips: docs/dev-seed-data.md).
//
//   npm run dev            # in the repo root, http://localhost:3000
//   cd site && npm run screenshots
//
// Needs the repo root's dependencies (it resolves `playwright` from there). Output goes to
// src/assets/screenshots/{light,dark}/<name>.png and is committed, so CI never needs the app.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "demo1234";
const VIEWPORT = { width: 1280, height: 900 };
const OUTPUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets", "screenshots");
const THEMES = ["light", "dark"];

async function signIn(page, username) {
  await page.goto(`${BASE_URL}/sign-in`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

async function settle(page) {
  // The app keeps a live-sync connection open, so "networkidle" never fires.
  await page.waitForLoadState("load");
  // Staggered card animations and first data fetches finish within a couple of seconds.
  await page.waitForTimeout(2000);
}

async function tripUrl(page, title) {
  await page.goto(`${BASE_URL}/trips`);
  await settle(page);
  const link = page.locator('a[href^="/trips/"]', { hasText: title }).first();
  return new URL(await link.getAttribute("href"), BASE_URL).pathname;
}

// Each shot: name, account, and an async `run(page, context)` that leaves the page ready to capture.
export const SHOTS = [
  { name: "sign-in", account: null, run: (page) => page.goto(`${BASE_URL}/sign-in`) },
  { name: "trips", account: "demo", run: (page) => page.goto(`${BASE_URL}/trips`) },
  {
    name: "trip-itinerary",
    account: "demo",
    run: async (page, context) => page.goto(`${BASE_URL}${context.tokyo}`),
  },
  {
    name: "trip-reservations",
    account: "demo",
    run: async (page, context) => page.goto(`${BASE_URL}${context.tokyo}?tab=res`),
  },
  {
    name: "trip-budget",
    account: "demo",
    run: async (page, context) => page.goto(`${BASE_URL}${context.tokyo}?tab=budget`),
  },
  // Profile → Security is not captured: every sign-in adds a "trusted browser" row, so reruns pile up duplicates.
  // The Map tab is not captured: it loads Mapbox tiles, which need a real MAPBOX_ACCESS_TOKEN in .env and
  // network access. Add a `trip-map` shot (`?tab=map`) when running with both.
  {
    name: "trip-day-expanded",
    account: "demo",
    run: async (page, context) => {
      await page.goto(`${BASE_URL}${context.tokyo}`);
      await settle(page);
      await page.getByText("Mon, Nov 2", { exact: false }).first().click();
    },
  },
  {
    name: "trip-share",
    account: "demo",
    run: async (page, context) => {
      await page.goto(`${BASE_URL}${context.tokyo}`);
      await settle(page);
      await page.getByRole("button", { name: "Share" }).click();
    },
  },
  {
    name: "new-trip",
    account: "demo",
    run: async (page) => {
      await page.goto(`${BASE_URL}/trips`);
      await settle(page);
      await page.getByRole("button", { name: "New trip", exact: true }).click();
    },
  },
  {
    name: "profile-preferences",
    account: "demo",
    run: async (page) => {
      await page.goto(`${BASE_URL}/profile`);
      await settle(page);
      await page.getByText("Preferences", { exact: true }).first().click();
    },
  },
  {
    name: "trip-documents",
    account: "demo",
    run: async (page, context) => page.goto(`${BASE_URL}${context.tokyo}?tab=docs`),
  },
  {
    name: "trip-packing",
    account: "demo",
    run: async (page, context) => page.goto(`${BASE_URL}${context.tokyo}?tab=pack`),
  },
  {
    name: "trip-notes",
    account: "demo",
    run: async (page, context) => page.goto(`${BASE_URL}${context.tokyo}?tab=notes`),
  },
  { name: "packing-templates", account: "demo", run: (page) => page.goto(`${BASE_URL}/packing`) },
  { name: "travel-history", account: "demo", run: (page) => page.goto(`${BASE_URL}/travel-history`) },
  { name: "profile", account: "demo", run: (page) => page.goto(`${BASE_URL}/profile`) },
  { name: "admin-overview", account: "admin", run: (page) => page.goto(`${BASE_URL}/admin/overview`) },
  { name: "admin-users", account: "admin", run: (page) => page.goto(`${BASE_URL}/admin/users`) },
];

async function captureTheme(browser, theme, only) {
  const outputDir = join(OUTPUT_ROOT, theme);
  mkdirSync(outputDir, { recursive: true });

  const accounts = [...new Set(SHOTS.map((shot) => shot.account))];
  for (const account of accounts) {
    const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme, deviceScaleFactor: 1 });
    const page = await context.newPage();
    if (account) await signIn(page, account);
    const shared = {};
    if (account === "demo") shared.tokyo = await tripUrl(page, "Tokyo");

    for (const shot of SHOTS.filter((candidate) => candidate.account === account)) {
      if (only && !only.includes(shot.name)) continue;
      await shot.run(page, shared);
      await settle(page);
      await page.screenshot({ path: join(outputDir, `${shot.name}.png`) });
      console.log(`${theme}/${shot.name}.png`);
    }
    await context.close();
  }
}

async function main() {
  const only = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.SCREENSHOT_CHROMIUM_PATH });
  try {
    for (const theme of THEMES) await captureTheme(browser, theme, only.length > 0 ? only : undefined);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
