// Regenerates the docs screenshots from a running dev server seeded with `npm run db:seed`
// (accounts and trips: docs/dev-seed-data.md).
//
//   npm run dev            # in the repo root, http://localhost:3000
//   cd site && SCREENSHOT_SEED_PASSWORD=<seed password> npm run screenshots   # password: docs/dev-seed-data.md
//
// Needs the repo root's dependencies and `.env` (it resolves `playwright`, `postgres` and `dotenv` from
// there, and reads DATABASE_URL and STORAGE_LOCAL_ROOT_DIR). Before capturing, it gives the seeded Tokyo
// and Kyoto trips photo covers (see cover-photos.mjs), which changes the dev database and storage folder;
// `npm run db:seed` restores the seed. Output goes to src/assets/screenshots/{light,dark}/<name>.webp and
// is committed, so CI never needs the app.

import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { chromium } from "playwright";
import postgres from "postgres";
import sharp from "sharp";

import { applyCoverPhotos } from "./cover-photos.mjs";
import { readSeedPassword } from "./screenshot-env.mjs";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const VIEWPORT = { width: 1280, height: 900 };
// Phone shots are captured at 2x so they stay sharp when the docs scale them.
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 };
const OUTPUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "assets", "screenshots");
const THEMES = ["light", "dark"];
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..");

async function signIn(page, username) {
  await page.goto(`${BASE_URL}/sign-in`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(readSeedPassword());
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
      // The seeded "today" day card carries an Active label, so this keeps working on any date.
      await page.getByText("Active", { exact: true }).first().click();
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
  { name: "admin-security", account: "admin", run: (page) => page.goto(`${BASE_URL}/admin/security`) },
  // Needs sam to have a 2FA requirement and no enrollment; main() sets and clears that around the run.
  { name: "mfa-enrollment", account: "sam", run: (page) => page.goto(`${BASE_URL}/mfa-enrollment`) },
  { name: "mobile-trips", account: "demo", mobile: true, run: (page) => page.goto(`${BASE_URL}/trips`) },
  {
    name: "mobile-itinerary",
    account: "demo",
    mobile: true,
    run: async (page, context) => {
      await page.goto(`${BASE_URL}${context.tokyo}`);
      await settle(page);
      await page.getByText("Active", { exact: true }).first().click();
    },
  },
];

async function captureTheme(browser, theme, only) {
  const outputDir = join(OUTPUT_ROOT, theme);
  mkdirSync(outputDir, { recursive: true });

  const groups = [...new Set(SHOTS.map((shot) => `${shot.account}|${Boolean(shot.mobile)}`))];
  for (const group of groups) {
    const [accountName, mobileFlag] = group.split("|");
    const account = accountName === "null" ? null : accountName;
    const mobile = mobileFlag === "true";
    const context = await browser.newContext({
      ...(mobile ? MOBILE : { viewport: VIEWPORT, deviceScaleFactor: 1 }),
      colorScheme: theme,
    });
    // The dev server's floating "LIVE" date-mock button is not part of the product; keep it out of shots.
    await context.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = '[data-testid="dev-date-picker-toggle"] { display: none !important; }';
        document.head.append(style);
      });
    });
    const page = await context.newPage();
    if (account) await signIn(page, account);
    const shared = {};
    if (account === "demo") shared.tokyo = await tripUrl(page, "Tokyo");

    for (const shot of SHOTS.filter(
      (candidate) => candidate.account === account && Boolean(candidate.mobile) === mobile
    )) {
      if (only && !only.includes(shot.name)) continue;
      await shot.run(page, shared);
      await settle(page);
      // WebP keeps photo covers from bloating the repo (the same shots were ~4x larger as PNG).
      const png = await page.screenshot();
      await sharp(png)
        .webp({ quality: 90 })
        .toFile(join(outputDir, `${shot.name}.webp`));
      console.log(`${theme}/${shot.name}.webp`);
    }
    await context.close();
  }
}

async function applyPhotoCovers() {
  dotenv.config({ path: join(REPO_ROOT, ".env"), quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (expected in the repo root .env).");
  const sql = postgres(process.env.DATABASE_URL);
  try {
    await applyCoverPhotos({
      photosDir: join(SCRIPT_DIR, "cover-photos"),
      storageRoot: resolve(REPO_ROOT, process.env.STORAGE_LOCAL_ROOT_DIR ?? "./.dev-storage"),
      findTripId: async (name) => (await sql`select id from trips where name = ${name}`)[0]?.id,
      setCoverUrl: (tripId, url) => sql`update trips set cover_image_url = ${url} where id = ${tripId}`,
    });
  } finally {
    await sql.end();
  }
}

const ENROLLMENT_ACCOUNT = "sam";

// Signing in as a seeded account with a 2FA requirement and no enrollment lands on the enrollment screen.
async function setEnrollmentRequired(required) {
  const sql = postgres(process.env.DATABASE_URL);
  try {
    await sql`update users set mfa_required = ${required} where username = ${ENROLLMENT_ACCOUNT}`;
  } finally {
    await sql.end();
  }
}

async function main() {
  await applyPhotoCovers();
  const only = process.argv.slice(2);
  const needsEnrollment = only.length === 0 || only.includes("mfa-enrollment");
  if (needsEnrollment) await setEnrollmentRequired(true);
  const browser = await chromium.launch({ executablePath: process.env.SCREENSHOT_CHROMIUM_PATH });
  try {
    for (const theme of THEMES) await captureTheme(browser, theme, only.length > 0 ? only : undefined);
  } finally {
    await browser.close();
    if (needsEnrollment) await setEnrollmentRequired(false);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
