import { readFileSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { After, Given, Then, When } from "../fixtures";

const storageRoot = resolve(E2E_STORAGE_DIRECTORY);
const failureMarker = join(storageRoot, ".storage-probes", "force-failure");
const ownedUploadsKey = "overviewOwnedUploads";
const ownedMarkerKey = "overviewOwnedMarker";

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

Given("scenario-owned uploads exist for the Overview measurement", async ({ scenario }) => {
  const identifier = randomUUID();
  const uploads = [join(storageRoot, `${identifier}.pdf`), join(storageRoot, "covers", `${identifier}.jpg`)];
  scenario.setValue(ownedUploadsKey, uploads);
  await mkdir(join(storageRoot, "covers"), { recursive: true });
  await writeFile(uploads[0], Buffer.alloc(6_237_721, "d"));
  await writeFile(uploads[1], "overview cover bytes");
});

Then("the Overview storage is healthy with readable usage and exact bytes on hover", async ({ page, scenario }) => {
  await expectExactUploadBytes(page);
  await expect(metricRow(page, "Document storage").getByText("Healthy", { exact: true })).toBeVisible();
  const uploads = scenario.getValue<string[]>(ownedUploadsKey)!;
  expect(await readFile(uploads[0])).toEqual(Buffer.alloc(6_237_721, "d"));
  expect(await readFile(uploads[1], "utf8")).toBe("overview cover bytes");
});

When("the Overview storage probe fails", async ({ page, scenario }) => {
  await mkdir(join(storageRoot, ".storage-probes"), { recursive: true });
  await writeFile(failureMarker, "forced overview probe failure", { flag: "wx" });
  // Only own a marker this scenario created; cleanup remains armed through subsequent failures.
  scenario.setValue(ownedMarkerKey, true);
  await page.reload();
});

Then("only the Overview storage health is unavailable", async ({ page }) => {
  await expect(metricRow(page, "Document storage").getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(metricRow(page, "Database").getByText("Healthy", { exact: true })).toBeVisible();
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  await expect(metricRow(page, "Version").getByText(version, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Overview" }).getByText("Unavailable", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Overview" }).locator("time")).toHaveCount(7);
});

Then("the Overview upload bytes still match stored files", async ({ page }) => {
  await expectExactUploadBytes(page);
  await expect(metricRow(page, "Document storage").getByText("Unavailable", { exact: true })).toBeVisible();
});

When("the Overview storage probe recovers", async ({ page, scenario }) => {
  await unlink(failureMarker);
  scenario.clearValue(ownedMarkerKey);
  await page.reload();
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
  ]) {
    await expect(section.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(metricRow(page, "Database").getByText("Healthy", { exact: true })).toBeVisible();
  await expect(section.getByText("Unavailable")).toHaveCount(0);
  await expect(section.locator("time")).toHaveCount(7);
});

Then("the Overview version matches package.json", async ({ page }) => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  await expect(page.getByRole("region", { name: "Overview" }).getByText(version, { exact: true })).toBeVisible();
});
