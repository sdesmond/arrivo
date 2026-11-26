import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { packingItems, packingTemplateItems, packingTemplates, tripPackingLists } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { headers, packingListApi } from "../api-support";

interface SaveTemplateApiState {
  templateId: string;
  responses: { status: number; body: unknown }[];
  key?: string;
}
const saveTemplateApiStates = new WeakMap<Page, SaveTemplateApiState>();
function saveTemplateApi(page: Page): SaveTemplateApiState {
  let current = saveTemplateApiStates.get(page);
  if (!current) {
    current = { templateId: randomUUID(), responses: [] };
    saveTemplateApiStates.set(page, current);
  }
  return current;
}
async function sendSaveTemplate(
  page: Page,
  listId: string,
  body: { tripId?: string; id?: string; name?: string },
  key?: string
) {
  const current = saveTemplateApi(page);
  const response = await (
    await apiClient(page)
  ).post(`/api/v1/packing-lists/${listId}/template`, {
    headers: { ...headers(page), ...(key ? { "Idempotency-Key": key } : {}) },
    data: { tripId: packingListApi(page).tripId, id: current.templateId, name: "API template", ...body },
  });
  const text = await response.text();
  const result = { status: response.status(), body: text ? JSON.parse(text) : undefined };
  current.responses.push(result);
  return result;
}
async function storedSavedTemplates(templateId: string) {
  return withE2EDb(async (database) => {
    const templates = await database.select().from(packingTemplates).where(eq(packingTemplates.id, templateId));
    const items = await database
      .select({
        id: packingTemplateItems.id,
        text: packingTemplateItems.text,
        position: packingTemplateItems.position,
        isLabel: packingTemplateItems.isLabel,
        labelId: packingTemplateItems.labelId,
      })
      .from(packingTemplateItems)
      .where(eq(packingTemplateItems.templateId, templateId))
      .orderBy(packingTemplateItems.position);
    return { templates, items };
  });
}
Given("the doomed packing list also holds a section with an item", async ({ page }) => {
  const current = packingListApi(page);
  await withE2EDb(async (database) => {
    const [section] = await database
      .insert(packingItems)
      .values({
        tripId: current.tripId,
        listId: current.doomedId,
        name: "Doomed gear",
        isLabel: true,
        position: 2,
        done: false,
      })
      .returning({ id: packingItems.id });
    await database.insert(packingItems).values({
      tripId: current.tripId,
      listId: current.doomedId,
      name: "Doomed boots",
      position: 3,
      done: true,
      labelId: section.id,
    });
  });
});
When("I save the doomed packing list as a template twice with one key and once with another", async ({ page }) => {
  const current = packingListApi(page);
  const key = randomUUID();
  await sendSaveTemplate(page, current.doomedId, {}, key);
  await sendSaveTemplate(page, current.doomedId, {}, key);
  await sendSaveTemplate(page, current.doomedId, {}, randomUUID());
});
Then("the template saves answer 200 and hold only the doomed list items once", async ({ page }) => {
  const current = saveTemplateApi(page);
  expect(current.responses.map((response) => response.status)).toEqual([200, 200, 200]);
  expect(current.responses[0].body).toMatchObject({ id: current.templateId, name: "API template" });
  const stored = await storedSavedTemplates(current.templateId);
  expect(stored.templates).toHaveLength(1);
  expect(stored.items.map((item) => item.text)).toEqual(["Doomed socks", "Doomed hat", "Doomed gear", "Doomed boots"]);
  const section = stored.items.find((item) => item.isLabel)!;
  expect(section.labelId).toBeNull();
  expect(stored.items.find((item) => item.text === "Doomed boots")!.labelId).toBe(section.id);
  expect(stored.items.filter((item) => item.text !== "Doomed boots").every((item) => item.labelId === null)).toBe(true);
});
When("I save the doomed packing list as a template under another name", async ({ page }) => {
  const current = packingListApi(page);
  await sendSaveTemplate(page, current.doomedId, {});
  await sendSaveTemplate(page, current.doomedId, { name: "Other name" });
});
Then("the second template save conflicts and the template keeps its name", async ({ page }) => {
  const current = saveTemplateApi(page);
  expect(current.responses.map((response) => response.status)).toEqual([200, 409]);
  expect((current.responses[1].body as { error: { code: string } }).error.code).toBe("conflict");
  expect((await storedSavedTemplates(current.templateId)).templates[0].name).toBe("API template");
});
When("I save the doomed packing list under the id of another user's template", async ({ page, scenario }) => {
  const other = await scenario.materialize({ user: { setCurrent: false } });
  const foreign = await scenario.materialize({
    template: { mother: "emptyTemplate", userId: other.user!.id, setCurrent: false },
  });
  saveTemplateApi(page).templateId = foreign.template!.id;
  await sendSaveTemplate(page, packingListApi(page).doomedId, {});
});
Then("the template save answers 404 with code {string} and nothing was copied", async ({ page }, code: string) => {
  const current = saveTemplateApi(page);
  expect(current.responses[0].status).toBe(404);
  expect((current.responses[0].body as { error: { code: string } }).error.code).toBe(code);
  const stored = await storedSavedTemplates(current.templateId);
  expect(stored.items).toHaveLength(0);
  expect(stored.templates.every((template) => template.name !== "API template")).toBe(true);
});
When(
  "I save an empty packing list, a missing list and a list of another trip as templates",
  async ({ page, scenario }) => {
    const current = packingListApi(page);
    const [empty] = await withE2EDb((database) =>
      database
        .insert(tripPackingLists)
        .values({ tripId: current.tripId, name: "Empty list", position: 9 })
        .returning({ id: tripPackingLists.id })
    );
    await sendSaveTemplate(page, empty.id, {});
    await sendSaveTemplate(page, randomUUID(), {});
    const { trip: otherTrip } = await scenario.materialize({ trip: { mother: "threeDayTrip", setCurrent: false } });
    await sendSaveTemplate(page, current.doomedId, { tripId: otherTrip!.id });
  }
);
Then("the template saves answer 422 then 404 then 404 and write nothing", async ({ page }) => {
  const current = saveTemplateApi(page);
  expect(current.responses.map((response) => response.status)).toEqual([422, 404, 404]);
  expect((current.responses[0].body as { error: { code: string } }).error.code).toBe("validation_failed");
  expect((await storedSavedTemplates(current.templateId)).templates).toHaveLength(0);
});
When("I attempt to save the doomed packing list as a template", async ({ page }) => {
  await sendSaveTemplate(page, packingListApi(page).doomedId, {});
});
Then("the template save is denied with {int} and nothing is written", async ({ page }, status: number) => {
  const current = saveTemplateApi(page);
  expect(current.responses[0].status).toBe(status);
  expect((await storedSavedTemplates(current.templateId)).templates).toHaveLength(0);
});
When("I commit a keyed save of the doomed packing list as a template", async ({ page }) => {
  const current = saveTemplateApi(page);
  current.key = randomUUID();
  const result = await sendSaveTemplate(page, packingListApi(page).doomedId, {}, current.key);
  expect(result.status).toBe(200);
});
When("I replay the keyed template save", async ({ page }) => {
  const current = saveTemplateApi(page);
  await sendSaveTemplate(page, packingListApi(page).doomedId, {}, current.key);
});
Then("the keyed template save replay is forbidden", async ({ page }) => {
  expect(saveTemplateApi(page).responses.map((response) => response.status)).toEqual([200, 403]);
});
When("I delete that saved template through the API", async ({ page }) => {
  const current = saveTemplateApi(page);
  const response = await (
    await apiClient(page)
  ).delete(`/api/v1/packing-templates/${current.templateId}`, {
    headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
    data: {},
  });
  expect(response.status()).toBe(204);
});
// Lives here because `sendSaveTemplate` and the save-template state are private to this file.
When("I save the doomed packing list as a template again under a fresh key", async ({ page }) => {
  await sendSaveTemplate(page, packingListApi(page).doomedId, {}, randomUUID());
});
Then("the save after deletion conflicts and the template stays absent", async ({ page }) => {
  const current = saveTemplateApi(page);
  expect(current.responses.map((response) => response.status)).toEqual([200, 409]);
  expect((current.responses[1].body as { error: { code: string } }).error.code).toBe("conflict");
  const stored = await storedSavedTemplates(current.templateId);
  expect(stored.templates).toHaveLength(0);
  expect(stored.items).toHaveLength(0);
});
Then("the deleted saved template replay is not found", async ({ page }) => {
  const current = saveTemplateApi(page);
  expect(current.responses.map((response) => response.status)).toEqual([200, 404]);
  const stored = await storedSavedTemplates(current.templateId);
  expect(stored.templates).toHaveLength(0);
  expect(stored.items).toHaveLength(0);
});
