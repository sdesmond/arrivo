import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { packingItems } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { headers, packingListApi, pullApiFixtures } from "../api-support";

Given("owned and foreign templates for the packing pull API", async ({ page, scenario }) => {
  const owned = await scenario.materialize({
    template: {
      mother: "emptyTemplate",
      overrides: { items: [{ text: "API passport", isLabel: false, position: 0 }] },
      setCurrent: false,
    },
  });
  const other = await scenario.materialize({ user: { setCurrent: false } });
  const foreign = await scenario.materialize({
    template: {
      mother: "emptyTemplate",
      userId: other.user!.id,
      overrides: { items: [{ text: "Foreign secret", isLabel: false, position: 0 }] },
      setCurrent: false,
    },
  });
  pullApiFixtures.set(page, { owned: owned.template!.id, foreign: foreign.template!.id, responses: [] });
});
async function sendPullApi(page: Page, key: string) {
  const fixture = pullApiFixtures.get(page)!;
  const current = packingListApi(page);
  const response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${current.tripId}/packing/pull-templates`, {
    headers: { ...headers(page), "Idempotency-Key": key },
    data: { templateIds: [fixture.owned, fixture.foreign], listId: current.keptId },
  });
  fixture.responses.push({ status: response.status(), body: await response.json() });
}
When("I pull those templates twice with the same key and once with a fresh key", async ({ page }) => {
  const key = randomUUID();
  await sendPullApi(page, key);
  await sendPullApi(page, key);
  await sendPullApi(page, randomUUID());
});
Then("the packing pull API replays counts and ignores the foreign template", async ({ page }) => {
  const fixture = pullApiFixtures.get(page)!;
  expect(fixture.responses).toEqual([
    { status: 200, body: { added: 1, skipped: 0 } },
    { status: 200, body: { added: 1, skipped: 0 } },
    { status: 200, body: { added: 0, skipped: 1 } },
  ]);
  const items = await withE2EDb((database) =>
    database
      .select({ name: packingItems.name })
      .from(packingItems)
      .where(eq(packingItems.tripId, packingListApi(page).tripId))
  );
  expect(items.filter((item) => item.name === "API passport")).toHaveLength(1);
  expect(items.some((item) => item.name === "Foreign secret")).toBe(false);
});
When("I attempt the packing template pull API", async ({ page }) => {
  await sendPullApi(page, randomUUID());
});
Then("the packing pull API denies access with {int}", async ({ page }, status: number) => {
  expect(pullApiFixtures.get(page)!.responses[0].status).toBe(status);
  const items = await withE2EDb((database) =>
    database
      .select({ name: packingItems.name })
      .from(packingItems)
      .where(eq(packingItems.tripId, packingListApi(page).tripId))
  );
  expect(items.some((item) => item.name === "API passport" || item.name === "Foreign secret")).toBe(false);
});
const pullReplayKeys = new WeakMap<Page, string>();
When("I commit a keyed template pull", async ({ page }) => {
  const key = randomUUID();
  pullReplayKeys.set(page, key);
  await sendPullApi(page, key);
  expect(pullApiFixtures.get(page)!.responses[0].status).toBe(200);
});
When("I replay the keyed template pull", async ({ page }) => {
  await sendPullApi(page, pullReplayKeys.get(page)!);
});
Then("the packing pull replay is forbidden", async ({ page }) => {
  expect(pullApiFixtures.get(page)!.responses.map((response) => response.status)).toEqual([200, 403]);
});
const scopedPullTemplates = new WeakMap<Page, string>();
Given("a sectioned template and matching item in another list for the packing pull API", async ({ page, scenario }) => {
  const template = await scenario.materialize({
    template: {
      mother: "emptyTemplate",
      setCurrent: false,
      overrides: {
        items: [
          { text: "Travel gear", isLabel: true, position: 0 },
          { text: "Shared boots", isLabel: false, position: 1, under: "Travel gear" },
        ],
      },
    },
  });
  scopedPullTemplates.set(page, template.template!.id);
  const current = packingListApi(page);
  await withE2EDb((database) =>
    database.insert(packingItems).values({
      tripId: current.tripId,
      listId: current.doomedId,
      name: "Shared boots",
      position: 2,
      done: false,
    })
  );
});
When("I pull that sectioned template into the selected list", async ({ page }) => {
  const current = packingListApi(page);
  const response = await (
    await apiClient(page)
  ).post(`/api/v1/trips/${current.tripId}/packing/pull-templates`, {
    headers: headers(page),
    data: { templateIds: [scopedPullTemplates.get(page)!], listId: current.keptId },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ added: 2, skipped: 0 });
});
Then("the packing pull stores the item under its section in that list", async ({ page }) => {
  const current = packingListApi(page);
  const rows = await withE2EDb((database) =>
    database.select().from(packingItems).where(eq(packingItems.tripId, current.tripId))
  );
  const section = rows.find((item) => item.listId === current.keptId && item.name === "Travel gear");
  const selectedItem = rows.find((item) => item.listId === current.keptId && item.name === "Shared boots");
  expect(section?.isLabel).toBe(true);
  expect(selectedItem?.labelId).toBe(section?.id);
  expect(
    rows
      .filter((item) => item.name === "Shared boots")
      .map((item) => item.listId)
      .sort()
  ).toEqual([current.doomedId, current.keptId].sort());
});
