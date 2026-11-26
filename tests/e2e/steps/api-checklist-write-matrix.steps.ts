import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { itineraryChecklists } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";
import {
  dayOneId,
  ensureItemApi,
  headers,
  itemApi,
  itemUrl,
  itemsUrl,
  lifecycleInput,
  sourceApi,
  state,
  storedItems,
  timelineSnapshot,
} from "../api-support";

// Matrix coverage across the lifecycle, item create/delete and source-create write endpoints.
type WriteEndpoint =
  "lifecycle-create" | "lifecycle-rename" | "lifecycle-delete" | "item-create" | "item-delete" | "source-create";
interface WriteBaseline {
  dayId: string;
  before: Awaited<ReturnType<typeof timelineSnapshot>>;
  checklistId: string;
  itemId: string;
}
const writeBaselines = new WeakMap<Page, WriteBaseline>();
async function captureWriteBaseline(page: Page, tripId: string): Promise<WriteBaseline> {
  const { checklistId } = await ensureItemApi(page, tripId);
  const dayId = await dayOneId(tripId);
  const baseline = { dayId, before: await timelineSnapshot(dayId), checklistId, itemId: state(page).itemId };
  writeBaselines.set(page, baseline);
  return baseline;
}
async function expectWriteBaselineIntact(page: Page) {
  const baseline = writeBaselines.get(page);
  if (!baseline) throw new Error("Write baseline missing");
  expect(await timelineSnapshot(baseline.dayId)).toEqual(baseline.before);
  const untouched = state(page).untouchedDay!;
  expect(await timelineSnapshot(untouched.dayId)).toEqual(untouched.before);
  const [checklist] = await withE2EDb((database) =>
    database
      .select({ title: itineraryChecklists.title })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.id, baseline.checklistId))
  );
  expect(checklist.title).toBe("API packing");
  expect(await storedItems(baseline.checklistId)).toMatchObject([
    { id: baseline.itemId, content: "API passport", isChecked: false },
  ]);
}
function validWriteRequest(page: Page, tripId: string, endpoint: WriteEndpoint, baseline: WriteBaseline) {
  const item = itemApi(page);
  const lifecycle = state(page).lifecycle!;
  switch (endpoint) {
    case "lifecycle-create":
      return {
        method: "POST",
        url: `/api/v1/trips/${tripId}/checklists`,
        data: { dayId: lifecycle.dayId, position: lifecycle.position, id: lifecycle.id, title: lifecycle.title },
      };
    case "lifecycle-rename":
      return { method: "PATCH", url: `/api/v1/checklists/${baseline.checklistId}`, data: { title: "Rejected rename" } };
    case "lifecycle-delete":
      return { method: "DELETE", url: `/api/v1/checklists/${baseline.checklistId}`, data: { tripId } };
    case "item-create":
      return { method: "POST", url: itemsUrl(baseline.checklistId), data: { id: item.id, content: item.content } };
    case "item-delete":
      return { method: "DELETE", url: itemUrl(baseline.itemId), data: { tripId } };
    case "source-create": {
      const source = sourceApi(page);
      return {
        method: "POST",
        url: `/api/v1/trips/${tripId}/checklists`,
        data: { dayId: source.dayId, position: source.position, id: source.checklistId, source: source.source },
      };
    }
  }
}
When(
  "I submit {string} to the {string} checklist endpoint",
  async ({ page, scenario }, testCase: string, endpoint: string) => {
    const tripId = scenario.currentTrip!.id;
    await lifecycleInput(page, tripId);
    const baseline = await captureWriteBaseline(page, tripId);
    const request = validWriteRequest(page, tripId, endpoint as WriteEndpoint, baseline);
    const requestHeaders = headers(page);
    let data: unknown = request.data;
    if (testCase === "malformed") data = "{";
    if (testCase === "non-object") data = "[]";
    if (testCase === "invalid-body") data = { unknown: true };
    if (testCase === "no-header") requestHeaders["x-arrivo-client"] = "";
    if (testCase === "wrong-type") requestHeaders["content-type"] = "text/plain";
    if (testCase === "cross-origin") requestHeaders.origin = "https://other.test";
    const client = await apiClient(page);
    state(page).response = await client.fetch(request.url, {
      method: request.method,
      headers: requestHeaders,
      data,
    });
  }
);
Then(
  "the checklist write endpoint returns {int} with code {string} and changed nothing",
  async ({ page }, status: number, code: string) => {
    const response = state(page).response!;
    expect(response.status()).toBe(status);
    const body = await response.json();
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error.code).toBe(code);
    expect(response.headers()["cache-control"]).toBe("no-store");
    if (code === "validation_failed") expect(body.error.fields).toBeDefined();
    await expectWriteBaselineIntact(page);
  }
);
interface KeyConflictPlan {
  method: string;
  url: string;
  checklistId: string;
  title: string;
  first: unknown;
  second: unknown;
}
interface KeyConflictState {
  dayId: string;
  afterFirst: Awaited<ReturnType<typeof timelineSnapshot>>;
  checklistId: string;
  title: string;
  itemCount: number;
}
const keyConflicts = new WeakMap<Page, KeyConflictState>();
// The second body carries a fresh checklist UUID, so only the key check stops it from creating a second row.
function keyConflictPlan(page: Page, tripId: string, dayId: string, checklistId: string, operation: string) {
  const createUrl = `/api/v1/trips/${tripId}/checklists`;
  if (operation === "lifecycle-rename")
    return {
      method: "PATCH",
      url: `/api/v1/checklists/${checklistId}`,
      checklistId,
      title: "Keyed rename",
      first: { title: "Keyed rename" },
      second: { title: "Conflicting rename" },
    } satisfies KeyConflictPlan;
  if (operation === "source-create") {
    const source = sourceApi(page);
    const body = { dayId, position: source.position, source: source.source };
    return {
      method: "POST",
      url: createUrl,
      checklistId: source.checklistId,
      title: source.title,
      first: { ...body, id: source.checklistId },
      second: { ...body, id: randomUUID() },
    } satisfies KeyConflictPlan;
  }
  const id = randomUUID();
  return {
    method: "POST",
    url: createUrl,
    checklistId: id,
    title: "Keyed lifecycle",
    first: { dayId, position: 1, id, title: "Keyed lifecycle" },
    second: { dayId, position: 1, id: randomUUID(), title: "Conflicting lifecycle" },
  } satisfies KeyConflictPlan;
}
When(
  "I send keyed {string} and then reuse its key with a different body",
  async ({ page, scenario }, operation: string) => {
    const tripId = scenario.currentTrip!.id;
    const { checklistId } = await ensureItemApi(page, tripId);
    const dayId = await dayOneId(tripId);
    const plan = keyConflictPlan(page, tripId, dayId, checklistId, operation);
    const send = async (data: unknown) =>
      (await apiClient(page)).fetch(plan.url, {
        method: plan.method,
        headers: { ...headers(page), "idempotency-key": state(page).key },
        data,
      });
    expect((await send(plan.first)).status()).toBe(200);
    keyConflicts.set(page, {
      dayId,
      afterFirst: await timelineSnapshot(dayId),
      checklistId: plan.checklistId,
      title: plan.title,
      itemCount: (await storedItems(plan.checklistId)).length,
    });
    state(page).response = await send(plan.second);
  }
);
Then(
  "the reused key returns {int} with code {string} and the first write stands",
  async ({ page }, status: number, code: string) => {
    const response = state(page).response!;
    expect(response.status()).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const conflict = keyConflicts.get(page)!;
    expect(await timelineSnapshot(conflict.dayId)).toEqual(conflict.afterFirst);
    const [checklist] = await withE2EDb((database) =>
      database
        .select({ title: itineraryChecklists.title })
        .from(itineraryChecklists)
        .where(eq(itineraryChecklists.id, conflict.checklistId))
    );
    expect(checklist.title).toBe(conflict.title);
    expect(await storedItems(conflict.checklistId)).toHaveLength(conflict.itemCount);
  }
);
