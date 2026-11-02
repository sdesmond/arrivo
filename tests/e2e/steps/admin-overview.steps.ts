import { readFileSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { After, Given, Then, When } from "../fixtures";
import { and, count, eq, gte } from "drizzle-orm";
import { activityEvents, documents, trips } from "../../../src/db/schema";
import { ActivityEventType, ReservationType } from "../../../src/data/types";
import { formatInstant } from "../../../src/lib/activity-dates";
import { EVENT_LABELS } from "../../../src/lib/activity-labels";
import { withE2EDb } from "../e2e-db";
import { seedActivityEvents, seedActor } from "../activity-seed";
import { waitForServerActionResponse } from "../server-action";

const storageRoot = resolve(E2E_STORAGE_DIRECTORY);
const failureMarker = join(storageRoot, ".storage-probes", "force-failure");
const ownedUploadsKey = "overviewOwnedUploads";
const ownedMarkerKey = "overviewOwnedMarker";
const privateDetailsKey = "overviewPrivateDetails";
const expectedAdminActionsKey = "overviewExpectedAdminActions";
const DAY_MS = 86_400_000;

interface ExpectedAdminAction {
  actor: string;
  action: string;
  target: string;
  occurredAt: string;
}

async function countFailedSignInsSince(since: Date) {
  return withE2EDb(async (db) => {
    const [row] = await db
      .select({ total: count() })
      .from(activityEvents)
      .where(and(eq(activityEvents.type, ActivityEventType.SignInFailed), gte(activityEvents.endedAt, since)));
    return row.total;
  });
}

async function readInstanceTotals() {
  return withE2EDb(async (db) => {
    const [tripRows, documentRows] = await Promise.all([
      db.select({ total: count() }).from(trips),
      db.select({ total: count() }).from(documents),
    ]);
    return { trips: tripRows[0].total, documents: documentRows[0].total };
  });
}

function metricRow(page: Page, label: string) {
  return page
    .getByRole("region", { name: "Overview" })
    .locator("dl > div")
    .filter({ has: page.getByText(label, { exact: true }) });
}

async function enumerateUploadBytes(directory = storageRoot): Promise<number> {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (directory === storageRoot && entry.name === ".storage-probes") continue;
    const path = join(directory, entry.name);
    try {
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) total += await enumerateUploadBytes(path);
      else if (stats.isFile()) total += stats.size;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return total;
}

async function expectExactUploadBytes(page: Page) {
  // Other scenarios may upload concurrently: compare only measurements bracketed by stable totals.
  await expect(async () => {
    const before = await enumerateUploadBytes();
    await page.reload();
    const value = metricRow(page, "Upload storage").locator("dd > span");
    const display = await value.innerText();
    const exactBytes = await value.getAttribute("title");
    const after = await enumerateUploadBytes();
    expect(after).toBe(before);
    expect(exactBytes).toBe(`${before} bytes`);
    const match = /^(\d+\.\d{2}) (KB|MB|GB|TB|PB)$/.exec(display);
    expect(match).not.toBeNull();
    const divisors: Record<string, number> = { KB: 1000, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15 };
    const divisor = divisors[match![2]];
    expect(Math.abs(Number(match![1]) - before / divisor)).toBeLessThanOrEqual(0.005);
    expect(before).toBeGreaterThanOrEqual(divisor);
  }).toPass({ timeout: 15_000, intervals: [100, 250, 500] });
}

After(async ({ scenario }) => {
  const paths = scenario.getValue<string[]>(ownedUploadsKey) ?? [];
  if (scenario.getValue<boolean>(ownedMarkerKey)) paths.push(failureMarker);
  await Promise.all(
    paths.map(async (path) => {
      try {
        await unlink(path);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    })
  );
});

Given("scenario-owned uploads exist for the Overview measurement", async ({ scenario, $testInfo }) => {
  // This scenario exercises independent refresh plus two full probe failure/recovery cycles.
  $testInfo.setTimeout(60_000);
  const identifier = randomUUID();
  const uploads = [join(storageRoot, `${identifier}.pdf`), join(storageRoot, "covers", `${identifier}.jpg`)];
  scenario.setValue(ownedUploadsKey, uploads);
  await mkdir(join(storageRoot, "covers"), { recursive: true });
  await writeFile(uploads[0], Buffer.alloc(6_237_721, "d"));
  await writeFile(uploads[1], "overview cover bytes");
});

Given("scenario-owned trips and documents exist across Overview accounts", async ({ scenario }) => {
  const admin = scenario.currentUser!;
  const tripName = scenario.uniqueName("Private admin trip");
  const eventName = scenario.uniqueName("Private event");
  const provider = scenario.uniqueName("Private reservation");
  const tripDocumentName = scenario.uniqueName("Private trip document");
  const eventDocumentName = scenario.uniqueName("Private event document");
  const reservationDocumentName = scenario.uniqueName("Private reservation document");
  const tripUrl = `https://example.invalid/${randomUUID()}/trip`;
  const eventUrl = `https://example.invalid/${randomUUID()}/event`;
  const reservationUrl = `https://example.invalid/${randomUUID()}/reservation`;
  await scenario.materialize({
    trip: {
      mother: "datelessTrip",
      overrides: {
        trip: { name: tripName },
        events: [{ name: eventName, position: 0 }],
        reservations: [{ type: ReservationType.Lodging, provider }],
        documents: [
          { name: tripDocumentName, kind: "link", url: tripUrl },
          { name: eventDocumentName, kind: "link", url: eventUrl, eventName },
          { name: reservationDocumentName, kind: "link", url: reservationUrl, reservationProvider: provider },
        ],
      },
    },
  });
  const memberName = scenario.uniqueName("Private member");
  const member = await scenario.materialize({
    user: { overrides: { user: { name: memberName, role: "member" } }, setCurrent: false },
  });
  const memberTripName = scenario.uniqueName("Private member trip");
  const memberDocumentName = scenario.uniqueName("Private member document");
  const memberUrl = `https://example.invalid/${randomUUID()}/member`;
  scenario.setCurrentUser(member.user);
  await scenario.materialize({
    trip: {
      mother: "datelessTrip",
      ownerId: member.user!.id,
      setCurrent: false,
      overrides: {
        trip: { name: memberTripName },
        documents: [{ name: memberDocumentName, kind: "link", url: memberUrl }],
      },
    },
  });
  scenario.setCurrentUser(admin);
  scenario.setValue(privateDetailsKey, [
    admin.username,
    admin.name,
    member.user!.username,
    memberName,
    tripName,
    eventName,
    provider,
    tripDocumentName,
    eventDocumentName,
    reservationDocumentName,
    tripUrl,
    eventUrl,
    reservationUrl,
    memberTripName,
    memberDocumentName,
    memberUrl,
  ]);
});

Then("the Overview trip and document totals match the database with checked times", async ({ page }) => {
  await expect(async () => {
    const before = await readInstanceTotals();
    const startedAt = Date.now();
    await page.reload();
    const tripRow = metricRow(page, "Trips");
    const documentRow = metricRow(page, "Documents");
    await expect(tripRow.locator("dd > span")).toHaveText(String(before.trips));
    await expect(documentRow.locator("dd > span")).toHaveText(String(before.documents));
    for (const row of [tripRow, documentRow]) {
      const checkedAt = await row.locator("time").getAttribute("datetime");
      expect(Date.parse(checkedAt!)).toBeGreaterThanOrEqual(startedAt);
      expect(Date.parse(checkedAt!)).toBeLessThanOrEqual(Date.now());
      await expect(row.locator("time")).toHaveText(/^Checked \d{1,2}:\d{2}:\d{2}/);
    }
    expect(await readInstanceTotals()).toEqual(before);
  }).toPass({ timeout: 15_000, intervals: [100, 250, 500] });
});

// Seeded rows are removed by the global `removeSeededActivity` After hook in app-activity.steps.ts.
Given("scenario-owned admin actions and failed sign-ins exist in Activity", async ({ scenario }) => {
  const now = Date.now();
  const actor = seedActor(scenario.uniqueName("overview-admin"));
  const types = [
    ActivityEventType.RoleChanged,
    ActivityEventType.AccountCreated,
    ActivityEventType.SetupLinkGenerated,
    ActivityEventType.PasswordResetLinkGenerated,
    ActivityEventType.RetentionChanged,
    ActivityEventType.AccountDeletedByAdmin,
  ];
  // Within the next hour so real admin events from parallel scenarios can't outrank them; oldest first.
  const adminEvents = types.map((type, index) => ({
    type,
    actor,
    startedAt: new Date(now + (30 + index) * 60_000),
    target: { id: randomUUID(), username: scenario.uniqueName(`overview-target-${index}`) },
  }));
  const nonAdminActor = seedActor(scenario.uniqueName("overview-traveller"));
  const tripId = randomUUID();
  await seedActivityEvents([
    ...adminEvents,
    // Newer than every admin event, so only the type filter keeps it out.
    { type: ActivityEventType.TripUpdated, actor: nonAdminActor, startedAt: new Date(now + 50 * 60_000), tripId },
    { type: ActivityEventType.SignInFailed, actor: null, startedAt: new Date(now - DAY_MS / 24) },
    { type: ActivityEventType.SignInFailed, actor: null, startedAt: new Date(now - DAY_MS - DAY_MS / 24) },
  ]);
  const expected: ExpectedAdminAction[] = adminEvents
    .slice(1)
    .reverse()
    .map((event) => ({
      actor: actor.username,
      action: EVENT_LABELS[event.type].action,
      target: event.target.username,
      occurredAt: event.startedAt.toISOString(),
    }));
  scenario.setValue(expectedAdminActionsKey, expected);
  scenario.setValue(privateDetailsKey, [nonAdminActor.username, adminEvents[0].target.username, tripId]);
});

Then("the Overview lists the five newest seeded admin actions newest first", async ({ page, scenario }) => {
  const expected = scenario.getValue<ExpectedAdminAction[]>(expectedAdminActionsKey)!;
  const browserZone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const items = metricRow(page, "Recent admin actions").getByRole("listitem");
  await expect(items).toHaveCount(expected.length);
  for (const [index, entry] of expected.entries()) {
    const item = items.nth(index);
    for (const text of [entry.actor, entry.action, entry.target]) await expect(item).toContainText(text);
    const time = item.locator("time");
    await expect(time).toHaveAttribute("datetime", entry.occurredAt);
    await expect(time).toHaveText(formatInstant(entry.occurredAt, browserZone));
  }
});

Then("the Overview failed sign-in count matches Activity for the last 24 hours", async ({ page }) => {
  // Parallel scenarios record real failures: compare against the same window, bracketed by stable counts.
  await expect(async () => {
    await page.reload();
    const row = metricRow(page, "Failed sign-ins (24 hours)");
    const checkedAt = await row.locator("time").getAttribute("datetime");
    await expect(row.locator("time")).toHaveText(/^Checked \d{1,2}:\d{2}:\d{2}/);
    const since = new Date(Date.parse(checkedAt!) - DAY_MS);
    const before = await countFailedSignInsSince(since);
    const display = await row.locator("dd > span").innerText();
    expect(await countFailedSignInsSince(since)).toBe(before);
    expect(before).toBeGreaterThanOrEqual(1);
    expect(display).toBe(String(before));
  }).toPass({ timeout: 15_000, intervals: [100, 250, 500] });
});

Then("the Overview contains no private fixture details", async ({ page, scenario }) => {
  const markup = await page.getByRole("region", { name: "Overview" }).innerHTML();
  for (const detail of scenario.getValue<string[]>(privateDetailsKey)!) expect(markup).not.toContain(detail);
  await expect(page.getByRole("region", { name: "Overview" }).getByRole("link")).toHaveCount(0);
});

Then("the Overview storage is healthy with readable usage and exact bytes on hover", async ({ page, scenario }) => {
  await expectExactUploadBytes(page);
  await expect(metricRow(page, "Document storage").getByText("Healthy", { exact: true })).toBeVisible();
  const uploads = scenario.getValue<string[]>(ownedUploadsKey)!;
  expect(await readFile(uploads[0])).toEqual(Buffer.alloc(6_237_721, "d"));
  expect(await readFile(uploads[1], "utf8")).toBe("overview cover bytes");
});

When("the Overview storage probe fails", async ({ scenario }) => {
  await mkdir(join(storageRoot, ".storage-probes"), { recursive: true });
  await writeFile(failureMarker, "forced overview probe failure", { flag: "wx" });
  // Only own a marker this scenario created; cleanup remains armed through subsequent failures.
  scenario.setValue(ownedMarkerKey, true);
});

When("I reload the Overview under the storage fault", async ({ page }) => {
  await page.reload();
});

Then("the Overview storage refresh is independent and keyboard accessible", async ({ page }) => {
  const row = metricRow(page, "Document storage");
  const checkedTimes = page.getByRole("region", { name: "Overview" }).locator("time", { hasText: /^Checked / });
  const before = await checkedTimes.evaluateAll((times) => times.map((time) => time.getAttribute("datetime")));
  const button = row.getByRole("button", { name: "Refresh Document storage" });
  const dimensions = await button.boundingBox();
  expect(dimensions!.width).toBeGreaterThanOrEqual(44);
  expect(dimensions!.height).toBeGreaterThanOrEqual(44);
  let releaseRequest!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/admin/overview", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    const response = waitForServerActionResponse(page, { pathIncludes: "/admin/overview" });
    await button.focus();
    await expect(button).toBeFocused();
    await expect(page.getByRole("tooltip")).toHaveText(/^Checked \d{1,2}:\d{2}:\d{2}/);
    expect(await button.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
    await button.press("Enter");
    await expect(button).toBeDisabled();
    await expect(row.getByRole("status")).toHaveText("Refreshing Document storage…");
    await expect(metricRow(page, "Users").getByRole("button")).toBeEnabled();
    releaseRequest();
    await response;
    await expect(row.getByRole("status")).toHaveText("Document storage refreshed.");
    await expect(button).toBeFocused();
    const after = await checkedTimes.evaluateAll((times) => times.map((time) => time.getAttribute("datetime")));
    expect(Date.parse(after[2]!)).toBeGreaterThan(Date.parse(before[2]!));
    expect(after.filter((_, index) => index !== 2)).toEqual(before.filter((_, index) => index !== 2));
  } finally {
    releaseRequest();
    await page.unroute("**/admin/overview");
  }
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  try {
    await expect(button).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const narrowDimensions = await button.boundingBox();
    expect(narrowDimensions!.width).toBeGreaterThanOrEqual(44);
    expect(narrowDimensions!.height).toBeGreaterThanOrEqual(44);
  } finally {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.setViewportSize(viewport);
  }
});

Then("the Overview storage refresh retains its stale value through repeated failures", async ({ page }) => {
  const row = metricRow(page, "Document storage");
  const checkedAt = await row.locator("time", { hasText: /^Checked / }).getAttribute("datetime");
  for (const action of ["Refresh", "Retry"]) {
    const response = waitForServerActionResponse(page, { pathIncludes: "/admin/overview" });
    await row.getByRole("button", { name: `${action} Document storage` }).click();
    await response;
    await expect(row.getByText("Stale", { exact: true })).toBeVisible();
    await expect(row.getByText("Healthy", { exact: true })).toBeVisible();
    await expect(row.locator("time", { hasText: /^Checked / })).toHaveAttribute("datetime", checkedAt!);
    await expect(row.getByRole("button", { name: "Retry Document storage" })).toBeEnabled();
  }
});

Then("the Overview storage Retry recovers its value", async ({ page }) => {
  const row = metricRow(page, "Document storage");
  const before = await row.locator("time", { hasText: /^Checked / }).getAttribute("datetime");
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/overview" });
  await row.getByRole("button", { name: "Retry Document storage" }).press("Enter");
  await response;
  await expect(row.getByText("Healthy", { exact: true })).toBeVisible();
  await expect(row.getByText("Stale", { exact: true })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Refresh Document storage" })).toBeEnabled();
  const after = await row.locator("time", { hasText: /^Checked / }).getAttribute("datetime");
  expect(Date.parse(after!)).toBeGreaterThan(Date.parse(before!));
});

Then("only the Overview storage health is unavailable", async ({ page }) => {
  await expect(metricRow(page, "Document storage").getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(
    metricRow(page, "Document storage").getByRole("button", { name: "Retry Document storage" })
  ).toBeEnabled();
  await expect(metricRow(page, "Database").getByText("Healthy", { exact: true })).toBeVisible();
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  await expect(metricRow(page, "Version").getByText(version, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Overview" }).getByText("Unavailable", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Overview" }).locator("time", { hasText: /^Checked / })).toHaveCount(
    11
  );
});

Then("the Overview upload bytes still match stored files", async ({ page }) => {
  await expectExactUploadBytes(page);
  await expect(metricRow(page, "Document storage").getByText("Unavailable", { exact: true })).toBeVisible();
});

When("the Overview storage probe recovers", async ({ scenario }) => {
  await unlink(failureMarker);
  scenario.clearValue(ownedMarkerKey);
});

// Also uses "I am signed in as an app {string}", "I request app management at {string}" and
// "app management is not found" from account-menu.steps.ts.

Then("I am on the app Overview", async ({ page }) => {
  await expect(page).toHaveURL(/\/admin\/overview$/);
  await expect(page.getByRole("heading", { name: "Manage app" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "App sections" });
  await expect(navigation.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link")).toHaveCount(3);
});

Then("the Overview offers a GitHub Sponsors link that opens in a new tab", async ({ page }) => {
  const support = page.getByRole("region", { name: "Support Arrivo" });
  const link = support.getByRole("link", { name: /Sponsor on GitHub/ });
  await expect(link).toHaveAttribute("href", "https://github.com/sponsors/sdesmond");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

Then("the Overview shows version, database health and user counts with checked times", async ({ page }) => {
  const section = page.getByRole("region", { name: "Overview" });
  for (const label of [
    "Version",
    "Database",
    "Users",
    "Admins",
    "Pending setup",
    "Document storage",
    "Upload storage",
    "Trips",
    "Documents",
    "Failed sign-ins (24 hours)",
    "Recent admin actions",
  ]) {
    await expect(section.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(metricRow(page, "Database").getByText("Healthy", { exact: true })).toBeVisible();
  await expect(section.getByText("Unavailable")).toHaveCount(0);
  await expect(section.locator("time", { hasText: /^Checked / })).toHaveCount(11);
});

Then("the Overview version matches package.json", async ({ page }) => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  await expect(page.getByRole("region", { name: "Overview" }).getByText(version, { exact: true })).toBeVisible();
});
