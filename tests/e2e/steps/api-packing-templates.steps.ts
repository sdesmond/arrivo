import { expect, type APIResponse, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { packingTemplateItems, packingTemplates } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, Then, When } from "../fixtures";

interface TemplateApiState {
  id: string;
  name: string;
  ownedId?: string;
  foreignId?: string;
  foreignName?: string;
  responses: APIResponse[];
  listed?: { id: string; name: string }[];
}
const states = new WeakMap<Page, TemplateApiState>();
function state(page: Page): TemplateApiState {
  const current = states.get(page);
  if (!current) throw new Error("Packing template API state missing");
  return current;
}
async function postTemplate(page: Page, data: Record<string, unknown>, key?: string): Promise<void> {
  const response = await (
    await apiClient(page)
  ).post("/api/v1/packing-templates", {
    headers: {
      "x-arrivo-client": "web",
      "content-type": "application/json",
      origin: new URL(page.url()).origin,
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    data,
  });
  state(page).responses.push(response);
}
async function rowsFor(id: string) {
  return withE2EDb((database) =>
    database
      .select({ id: packingTemplates.id, name: packingTemplates.name })
      .from(packingTemplates)
      .where(eq(packingTemplates.id, id))
  );
}

Given("a new template id and name for the packing template API", async ({ page, scenario }) => {
  await scenario.ensureCurrentUser();
  states.set(page, { id: randomUUID(), name: `API ${randomUUID().slice(0, 8)}`, responses: [] });
});

Given("my own and a different user's templates for the packing template API", async ({ page, scenario }) => {
  const current = state(page);
  const owned = await scenario.materialize({ template: { mother: "emptyTemplate", setCurrent: false } });
  const other = await scenario.materialize({ user: { setCurrent: false } });
  const foreign = await scenario.materialize({
    template: { mother: "emptyTemplate", userId: other.user!.id, setCurrent: false },
  });
  current.ownedId = owned.template!.id;
  current.foreignId = foreign.template!.id;
  const [row] = await rowsFor(foreign.template!.id);
  current.foreignName = row.name;
});

When("I create that template through the API twice with the same key", async ({ page }) => {
  const current = state(page);
  const key = randomUUID();
  await postTemplate(page, { id: current.id, name: current.name }, key);
  await postTemplate(page, { id: current.id, name: current.name }, key);
});

When("I create that template through the API under another name", async ({ page }) => {
  const current = state(page);
  await postTemplate(page, { id: current.id, name: current.name });
  await postTemplate(page, { id: current.id, name: `${current.name} 2` });
});

When("I create a template through the API with the id of a different user's template", async ({ page }) => {
  const current = state(page);
  await postTemplate(page, { id: current.foreignId, name: "Hijack" });
});

When("I list my templates through the API", async ({ page }) => {
  const response = await (
    await apiClient(page)
  ).get("/api/v1/packing-templates", {
    headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
  });
  const current = state(page);
  current.responses.push(response);
  current.listed = (await response.json()).templates;
});

Then("the packing template API answered {int} each time with one stored row", async ({ page }, status: number) => {
  const current = state(page);
  for (const response of current.responses) expect(response.status()).toBe(status);
  const bodies = await Promise.all(current.responses.map((response) => response.json()));
  expect(bodies[1]).toEqual(bodies[0]);
  expect(await rowsFor(current.id)).toEqual([{ id: current.id, name: current.name }]);
});

Then("the packing template API answered {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = state(page).responses.at(-1)!;
  expect(response.status()).toBe(status);
  expect((await response.json()).error.code).toBe(code);
});

Then("the different user's template is unchanged", async ({ page }) => {
  const current = state(page);
  expect(await rowsFor(current.foreignId!)).toEqual([{ id: current.foreignId, name: current.foreignName }]);
});

Then("the stored template keeps its first name", async ({ page }) => {
  const current = state(page);
  expect(await rowsFor(current.id)).toEqual([{ id: current.id, name: current.name }]);
});

Then("my template list holds my template but not the different user's", async ({ page }) => {
  const current = state(page);
  expect(current.responses.at(-1)!.status()).toBe(200);
  const ids = (current.listed ?? []).map((template) => template.id);
  expect(ids).toContain(current.ownedId);
  expect(ids).not.toContain(current.foreignId);
});

When("I request and mutate the foreign template through the API", async ({ page }) => {
  const current = state(page);
  const client = await apiClient(page);
  const path = `/api/v1/packing-templates/${current.foreignId}`;
  const headers = { "x-arrivo-client": "web", origin: new URL(page.url()).origin };
  current.responses.push(await client.get(path, { headers }));
  current.responses.push(await client.patch(path, { headers, data: { name: "Hijack" } }));
  current.responses.push(await client.delete(path, { headers, data: {} }));
});
Then("foreign template lifecycle responses hide ownership", async ({ page }) => {
  expect(state(page).responses.map((response) => response.status())).toEqual([404, 404, 204]);
});
When("I create, rename and delete that template and replay both writes", async ({ page }) => {
  const current = state(page);
  const client = await apiClient(page);
  const createKey = randomUUID(),
    renameKey = randomUUID();
  const path = `/api/v1/packing-templates/${current.id}`;
  const headers = { "x-arrivo-client": "web", origin: new URL(page.url()).origin };
  await postTemplate(page, { id: current.id, name: current.name }, createKey);
  current.responses.push(
    await client.patch(path, { headers: { ...headers, "Idempotency-Key": renameKey }, data: { name: "Renamed" } })
  );
  current.responses.push(await client.delete(path, { headers, data: {} }));
  await postTemplate(page, { id: current.id, name: current.name }, createKey);
  current.responses.push(
    await client.patch(path, { headers: { ...headers, "Idempotency-Key": renameKey }, data: { name: "Renamed" } })
  );
  current.responses.push(await client.delete(path, { headers, data: {} }));
});
Then("the deleted template remains absent on replay", async ({ page }) => {
  const current = state(page);
  expect(current.responses.map((response) => response.status())).toEqual([200, 200, 204, 404, 404, 204]);
  expect(await rowsFor(current.id)).toHaveLength(0);
});

Given("an owned template with an item for the packing template API", async ({ page, scenario }) => {
  const result = await scenario.materialize({
    template: { overrides: { items: [{ text: "Hat", isLabel: false, position: 0 }] }, setCurrent: false },
  });
  states.set(page, { id: result.template!.id, name: "", responses: [] });
});
When("I delete the owned template through the API twice", async ({ page }) => {
  const current = state(page);
  const client = await apiClient(page);
  const path = `/api/v1/packing-templates/${current.id}`;
  const headers = { "x-arrivo-client": "web", origin: new URL(page.url()).origin };
  current.responses.push(await client.delete(path, { headers, data: {} }));
  current.responses.push(await client.delete(path, { headers, data: {} }));
});
Then("the template and its items are gone", async ({ page }) => {
  const current = state(page);
  expect(current.responses.map((response) => response.status())).toEqual([204, 204]);
  expect(await rowsFor(current.id)).toHaveLength(0);
  const items = await withE2EDb((database) =>
    database.select().from(packingTemplateItems).where(eq(packingTemplateItems.templateId, current.id))
  );
  expect(items).toHaveLength(0);
});

Given("an owned template with ordered items for the packing template API", async ({ page, scenario }) => {
  const result = await scenario.materialize({
    template: {
      overrides: {
        template: { name: "Ordered gear" },
        items: [
          { text: "Second", isLabel: false, position: 1 },
          { text: "First", isLabel: false, position: 0 },
        ],
      },
      setCurrent: false,
    },
  });
  states.set(page, { id: result.template!.id, name: "Ordered gear", responses: [] });
});
When("I request that template detail through the API", async ({ page }) => {
  const current = state(page);
  current.responses.push(
    await (
      await apiClient(page)
    ).get(`/api/v1/packing-templates/${current.id}`, {
      headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
    })
  );
});
Then("the owned template detail contains its items in order", async ({ page }) => {
  const current = state(page);
  const response = current.responses[0];
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.template).toMatchObject({ id: current.id, name: current.name });
  expect(body.items.map((item: { text: string }) => item.text)).toEqual(["First", "Second"]);
});
When("I send invalid template lifecycle requests", async ({ page }) => {
  const current = state(page);
  const client = await apiClient(page);
  const headers = { "x-arrivo-client": "web", origin: new URL(page.url()).origin };
  const path = `/api/v1/packing-templates/${current.id}`;
  current.responses.push(await client.get("/api/v1/packing-templates/not-a-uuid", { headers }));
  current.responses.push(
    await client.patch("/api/v1/packing-templates/not-a-uuid", { headers, data: { name: "Changed" } })
  );
  current.responses.push(await client.delete("/api/v1/packing-templates/not-a-uuid", { headers, data: {} }));
  current.responses.push(await client.patch(path, { headers, data: { name: "   " } }));
  current.responses.push(await client.patch(path, { headers, data: { name: "x".repeat(31) } }));
  current.responses.push(await client.patch(path, { headers, data: { name: "Valid", extra: true } }));
});
Then("those lifecycle requests are rejected and the template is unchanged", async ({ page }) => {
  const current = state(page);
  for (const response of current.responses) {
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe("validation_failed");
  }
  expect(await rowsFor(current.id)).toEqual([{ id: current.id, name: current.name }]);
  const items = await withE2EDb((database) =>
    database
      .select()
      .from(packingTemplateItems)
      .where(eq(packingTemplateItems.templateId, current.id))
      .orderBy(packingTemplateItems.position)
  );
  expect(items.map((item) => item.text)).toEqual(["First", "Second"]);
});
