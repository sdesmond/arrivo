import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import postgres from "postgres";
import {
  checklistItems,
  itineraryChecklists,
  days,
  collaborators,
  idempotencyKeys,
  users,
  documents,
  events,
  expenses,
  itineraryNotes,
  notes,
  pendingFileDeletions,
  packingItems,
  packingTemplates,
  tripPackingLists,
} from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { waitForApiResponse } from "../api-response";
import { Given, When, Then, After } from "../fixtures";
interface KeyedResult {
  status: number;
  body: unknown;
}
interface ApiScenarioState {
  itemId: string;
  role?: string;
  revokedCookie?: string;
  response?: APIResponse;
  /** Per-scenario `Idempotency-Key` value and the unique suffix of its audit/failure database objects. */
  key: string;
  suffix: string;
  auditInstalled?: boolean;
  failureInstalled?: boolean;
  /** A second connection holding the actor/key advisory lock, released by `release`. */
  lockHolder?: { release: () => void; finished: Promise<unknown>; client: ReturnType<typeof postgres> };
  /** Results of the latest keyed send/retry step, and the body of the first successful keyed response. */
  responses: KeyedResult[];
  first?: unknown;
  lifecycle?: {
    tripId: string;
    dayId: string;
    id: string;
    firstItem: { id: string; content: string };
    position: number;
    title: string;
  };
  untouchedDay?: { dayId: string; before: Awaited<ReturnType<typeof timelineSnapshot>> };
}
const REPLAY_KEY_PREFIX = "api:v1:";
const states = new WeakMap<Page, ApiScenarioState>();
function state(page: Page): ApiScenarioState {
  const value = states.get(page);
  if (!value) throw new Error("API fixture missing");
  return value;
}
function headers(page: Page) {
  return { "x-arrivo-client": "web", "content-type": "application/json", origin: new URL(page.url()).origin };
}
function itemUrl(itemId: string) {
  return `/api/v1/checklist-items/${itemId}`;
}
Given("a scenario-owned checklist API item", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip("threeDayTrip", {
    events: [
      { name: "API mixed event", dayNumber: 1, position: 0 },
      { name: "API later event", dayNumber: 1, position: 3 },
      { name: "API untouched event", dayNumber: 2, position: 1 },
    ],
    notes: [
      { content: "API mixed note", dayNumber: 1, position: 1 },
      { content: "API untouched note", dayNumber: 2, position: 1 },
    ],
    checklists: [
      {
        dayNumber: 1,
        position: 2,
        title: "API packing",
        items: [{ text: "API passport", position: 0, isChecked: false }],
      },
      { dayNumber: 2, position: 1, title: "API untouched checklist", items: [] },
    ],
  });
  const itemId = await withE2EDb(async (database) => {
    const [item] = await database
      .select({ id: checklistItems.id })
      .from(checklistItems)
      .innerJoin(itineraryChecklists, eq(checklistItems.checklistId, itineraryChecklists.id))
      .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
      .where(eq(days.tripId, trip.id));
    return item.id;
  });
  const unique = randomUUID();
  const [otherDay] = await withE2EDb((database) =>
    database
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, trip.id), eq(days.dayNumber, 2)))
  );
  const untouchedDay = { dayId: otherDay.id, before: await timelineSnapshot(otherDay.id) };
  states.set(page, { itemId, key: `e2e-${unique}`, suffix: unique.replaceAll("-", ""), responses: [], untouchedDay });
  await scenario.signIn(page);
  await scenario.gotoCurrentTrip(page);
});
Given("my checklist API role is {string}", async ({ page, scenario }, role: string) => {
  state(page).role = role;
  if (role === "anonymous") {
    await page.context().clearCookies();
    return;
  }
  const tripId = scenario.currentTrip!.id;
  const userId = scenario.currentUser!.id;
  await withE2EDb(async (database) => {
    const condition = and(eq(collaborators.tripId, tripId), eq(collaborators.userId, userId));
    if (role === "stranger") await database.delete(collaborators).where(condition);
    else await database.update(collaborators).set({ role }).where(condition);
  });
});
When("I set the checklist API checked state to {string} twice", async ({ page }, value: string) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await page.request.patch(itemUrl(state(page).itemId), {
      headers: headers(page),
      data: { isChecked: value === "true" },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).isChecked).toBe(value === "true");
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});
Then("the checklist API state {string} persists after reload", async ({ page }, value: string) => {
  await page.reload();
  const firstDayToggle = page
    .locator("button")
    .filter({ hasText: /\d+ stops/ })
    .first();
  if ((await firstDayToggle.getAttribute("aria-expanded")) === "false") await firstDayToggle.click();
  const itemId = state(page).itemId;
  const checked = await withE2EDb(async (database) => {
    const [item] = await database
      .select({ isChecked: checklistItems.isChecked })
      .from(checklistItems)
      .where(eq(checklistItems.id, itemId));
    return item.isChecked;
  });
  expect(checked).toBe(value === "true");
  const checklist = page.locator('[id^="checklist-"]').filter({ hasText: "API packing" });
  if (value === "true") await expect(checklist.getByLabel("Complete")).toBeVisible();
  else {
    await checklist.getByRole("button").first().click();
    await expect(checklist.getByTitle("Check item")).toBeVisible();
  }
});
When("I attempt a checklist API write", async ({ page }) => {
  const requestHeaders: Record<string, string> = headers(page);
  const revokedCookie = state(page).revokedCookie;
  if (revokedCookie) requestHeaders.cookie = revokedCookie;
  state(page).response = await page.request.patch(itemUrl(state(page).itemId), {
    headers: requestHeaders,
    data: { isChecked: true },
  });
});
When("I submit checklist API case {string}", async ({ page }, testCase: string) => {
  const requestHeaders = headers(page);
  let itemId = state(page).itemId;
  let data: unknown = { isChecked: true };
  if (testCase === "malformed") data = "{";
  if (testCase === "non-object") data = "[]";
  if (testCase === "invalid-body") data = { isChecked: "yes" };
  if (testCase === "invalid-id") itemId = "invalid";
  if (testCase === "missing-item") itemId = randomUUID();
  if (testCase === "no-header") requestHeaders["x-arrivo-client"] = "";
  if (testCase === "wrong-type") requestHeaders["content-type"] = "text/plain";
  if (testCase === "cross-origin") requestHeaders.origin = "https://other.test";
  const extraHeaders: Record<string, string> = testCase === "same-site" ? { "sec-fetch-site": "same-site" } : {};
  state(page).response = await page.request.patch(itemUrl(itemId), {
    headers: { ...requestHeaders, ...extraHeaders },
    data,
  });
});
Then(
  "the checklist API returns {int} with code {string} and no write",
  async ({ page }, status: number, code: string) => {
    const response = state(page).response!;
    expect(response.status()).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
    if (code === "validation_failed") expect(body.error.fields).toBeDefined();
    if (state(page).role === "viewer") expect(body.error.requiredRole).toBe("editor");
    const checked = await withE2EDb(async (database) => {
      const [item] = await database
        .select({ isChecked: checklistItems.isChecked })
        .from(checklistItems)
        .where(eq(checklistItems.id, state(page).itemId));
      return item.isChecked;
    });
    expect(checked).toBe(false);
  }
);

Given("my checklist API session has been revoked", async ({ page, scenario }) => {
  const sessionCookies = (await page.context().cookies()).filter((cookie) => cookie.name.includes("session-token"));
  expect(sessionCookies.length).toBeGreaterThan(0);
  state(page).revokedCookie = sessionCookies.map((cookie) => cookie.name + "=" + cookie.value).join("; ");
  await withE2EDb(async (database) => {
    await database
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, scenario.currentUser!.id));
  });
});
When("I uncheck the checklist item through the UI", async ({ page }) => {
  const checklist = page.locator('[id^="checklist-"]').filter({ hasText: "API packing" });
  if (!(await checklist.getByTitle("Uncheck item").isVisible())) await checklist.getByRole("button").first().click();
  const pending = waitForApiResponse(page, { method: "PATCH", path: itemUrl(state(page).itemId) });
  await checklist.getByTitle("Uncheck item").click();
  const response = await pending;
  expect((await response.json()).isChecked).toBe(false);
});

async function sendKeyed(
  page: Page,
  isChecked: boolean,
  key = state(page).key,
  itemId = state(page).itemId
): Promise<KeyedResult> {
  const response = await page.request.patch(itemUrl(itemId), {
    headers: { ...headers(page), "idempotency-key": key },
    data: { isChecked },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Keep the raw text for diagnostics.
  }
  const current = state(page);
  current.response = response;
  const result = { status: response.status(), body };
  if (result.status === 200) current.first ??= body;
  return result;
}
async function releaseKeyLock(current: ApiScenarioState) {
  const holder = current.lockHolder;
  if (!holder) return;
  current.lockHolder = undefined;
  holder.release();
  await holder.finished.catch(() => undefined);
  await holder.client.end();
}
// Audit and failure objects are scenario-unique and dropped in the After hook, even when the scenario fails.
async function dropScenarioObjects(page: Page) {
  const current = states.get(page);
  if (!current) return;
  const { suffix, key, auditInstalled, failureInstalled } = current;
  await releaseKeyLock(current);
  await withE2EDb(async (database) => {
    if (failureInstalled) {
      await database.execute(sql.raw(`drop trigger if exists e2e_fail_trg_${suffix} on idempotency_keys`));
      await database.execute(sql.raw(`drop function if exists e2e_fail_fn_${suffix}()`));
    }
    if (auditInstalled) {
      await database.execute(sql.raw(`drop trigger if exists e2e_audit_trg_${suffix} on checklist_items`));
      await database.execute(sql.raw(`drop function if exists e2e_audit_fn_${suffix}()`));
      await database.execute(sql.raw(`drop table if exists e2e_audit_${suffix}`));
    }
    await database.delete(idempotencyKeys).where(eq(idempotencyKeys.key, `${REPLAY_KEY_PREFIX}${key}`));
  });
  current.auditInstalled = false;
  current.failureInstalled = false;
}
After(async ({ page }) => {
  await dropScenarioObjects(page);
});
Given("the checklist API write audit is installed", async ({ page }) => {
  const { itemId, suffix } = state(page);
  await withE2EDb(async (database) => {
    await database.execute(sql.raw(`create table e2e_audit_${suffix} (id serial primary key, item_id uuid not null)`));
    await database.execute(
      sql.raw(
        `create function e2e_audit_fn_${suffix}() returns trigger language plpgsql as $$ begin insert into e2e_audit_${suffix} (item_id) values (new.id); return new; end $$`
      )
    );
    await database.execute(
      sql.raw(
        `create trigger e2e_audit_trg_${suffix} after update on checklist_items for each row when (old.id = '${itemId}') execute function e2e_audit_fn_${suffix}()`
      )
    );
  });
  state(page).auditInstalled = true;
});
Given("the checklist API replay record write is set to fail", async ({ page }) => {
  const { suffix, key } = state(page);
  await withE2EDb(async (database) => {
    await database.execute(
      sql.raw(
        `create function e2e_fail_fn_${suffix}() returns trigger language plpgsql as $$ begin raise exception 'e2e replay record write failure'; end $$`
      )
    );
    await database.execute(
      sql.raw(
        `create trigger e2e_fail_trg_${suffix} before insert or update on idempotency_keys for each row when (new.key = '${REPLAY_KEY_PREFIX}${key}') execute function e2e_fail_fn_${suffix}()`
      )
    );
  });
  state(page).failureInstalled = true;
});
Given("another request holds the checklist API key lock", async ({ page, scenario }) => {
  const current = state(page);
  const lockKey = JSON.stringify([scenario.currentUser!.id, `${REPLAY_KEY_PREFIX}${current.key}`]);
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 1 });
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired: () => void = () => undefined;
  const lockAcquired = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const finished = client.begin(async (transaction) => {
    await transaction`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    acquired();
    await held;
  });
  current.lockHolder = { release, finished, client };
  await Promise.race([lockAcquired, finished]);
});
When("the checklist API key lock is released", async ({ page }) => {
  await releaseKeyLock(state(page));
});
When("the checklist API replay record write is repaired", async ({ page }) => {
  const current = state(page);
  await withE2EDb(async (database) => {
    await database.execute(sql.raw(`drop trigger if exists e2e_fail_trg_${current.suffix} on idempotency_keys`));
    await database.execute(sql.raw(`drop function if exists e2e_fail_fn_${current.suffix}()`));
  });
  current.failureInstalled = false;
});
When(
  "I send {int} keyed checklist API write(s) of {string} one after another",
  async ({ page }, count: number, value: string) => {
    const current = state(page);
    current.responses = [];
    for (let attempt = 0; attempt < count; attempt += 1) {
      current.responses.push(await sendKeyed(page, value === "true"));
    }
  }
);
When(
  "I send {int} keyed checklist API write(s) of {string} at the same time",
  async ({ page }, count: number, value: string) => {
    const current = state(page);
    current.responses = await Promise.all(Array.from({ length: count }, () => sendKeyed(page, value === "true")));
  }
);
When("I retry the keyed checklist API write of {string}", async ({ page }, value: string) => {
  state(page).responses = [await sendKeyed(page, value === "true")];
});
When("I send an unkeyed checklist API write of {string}", async ({ page }, value: string) => {
  const response = await page.request.patch(itemUrl(state(page).itemId), {
    headers: headers(page),
    data: { isChecked: value === "true" },
  });
  expect(response.status()).toBe(200);
});
When("I reuse the checklist API key for a different {word}", async ({ page }, change: string) => {
  const current = state(page);
  let itemId = current.itemId;
  if (change === "resource") {
    itemId = await withE2EDb(async (database) => {
      const [original] = await database
        .select({ checklistId: checklistItems.checklistId })
        .from(checklistItems)
        .where(eq(checklistItems.id, current.itemId));
      const [added] = await database
        .insert(checklistItems)
        .values({ checklistId: original.checklistId, content: "API visa", isChecked: false })
        .returning({ id: checklistItems.id });
      return added.id;
    });
  }
  // A payload change flips the value; a resource change keeps it and targets the other item.
  await sendKeyed(page, change !== "payload", current.key, itemId);
  if (change === "resource") {
    const [other] = await withE2EDb(async (database) =>
      database.select({ isChecked: checklistItems.isChecked }).from(checklistItems).where(eq(checklistItems.id, itemId))
    );
    expect(other.isChecked).toBe(false);
  }
});
When("the keyed checklist API record has expired", async ({ page, scenario }) => {
  const current = state(page);
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  const rows = await withE2EDb(async (database) =>
    database
      .update(idempotencyKeys)
      .set({ result: sql`jsonb_set(${idempotencyKeys.result}, '{expiresAt}', to_jsonb(${expiredAt}::text))` })
      .where(
        and(
          eq(idempotencyKeys.key, `${REPLAY_KEY_PREFIX}${current.key}`),
          eq(idempotencyKeys.userId, scenario.currentUser!.id)
        )
      )
      .returning({ key: idempotencyKeys.key })
  );
  expect(rows).toHaveLength(1);
});
When("I send a checklist API write with an {word} idempotency key", async ({ page }, kind: string) => {
  state(page).response = await page.request.patch(itemUrl(state(page).itemId), {
    headers: { ...headers(page), "idempotency-key": kind === "empty" ? "" : "k".repeat(256) },
    data: { isChecked: true },
  });
});
Then(
  "every keyed checklist API response succeeded with identical JSON and state {string}",
  async ({ page }, value: string) => {
    const { responses } = state(page);
    expect(responses.length).toBeGreaterThan(0);
    for (const result of responses) {
      expect(result.status).toBe(200);
      expect(result.body).toEqual(responses[0].body);
      expect((result.body as { isChecked: boolean }).isChecked).toBe(value === "true");
    }
  }
);
Then(
  "the retried keyed checklist API response equals the first with state {string}",
  async ({ page }, value: string) => {
    const current = state(page);
    expect(current.responses).toHaveLength(1);
    expect(current.responses[0].status).toBe(200);
    expect(current.responses[0].body).toEqual(current.first);
    expect((current.first as { isChecked: boolean }).isChecked).toBe(value === "true");
  }
);
Then("the stored checklist API state is {string}", async ({ page }, value: string) => {
  const itemId = state(page).itemId;
  const checked = await withE2EDb(async (database) => {
    const [item] = await database
      .select({ isChecked: checklistItems.isChecked })
      .from(checklistItems)
      .where(eq(checklistItems.id, itemId));
    return item.isChecked;
  });
  expect(checked).toBe(value === "true");
});
Then(
  "the checklist API returns {int} with code {string} and no cached result",
  async ({ page }, status: number, code: string) => {
    const current = state(page);
    const response = current.response!;
    expect(response.status()).toBe(status);
    const text = await response.text();
    const body = JSON.parse(text);
    expect(body.error.code).toBe(code);
    expect(Object.keys(body)).toEqual(["error"]);
    expect(text).not.toContain("API passport");
    expect(text).not.toContain(current.itemId);
    expect(response.headers()["cache-control"]).toBe("no-store");
    if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
  }
);
Then(
  "the checklist API audit shows {int} committed update(s) and {int} replay record(s)",
  async ({ page, scenario }, updates: number, records: number) => {
    const current = state(page);
    const counts = await withE2EDb(async (database) => {
      const audit = await database.execute<{ count: string }>(
        sql.raw(`select count(*)::text as count from e2e_audit_${current.suffix}`)
      );
      const stored = await database
        .select({ key: idempotencyKeys.key })
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, `${REPLAY_KEY_PREFIX}${current.key}`),
            eq(idempotencyKeys.userId, scenario.currentUser!.id)
          )
        );
      return { updates: Number(audit[0].count), records: stored.length };
    });
    expect(counts).toEqual({ updates, records });
  }
);

Given("I am {string} for the API metadata", async ({ page }, audience: string) => {
  if (audience === "anonymous") await page.context().clearCookies();
});
When("I request the API metadata", async ({ page }) => {
  state(page).response = await page.request.get("/api/v1/meta");
});
Then("the API metadata is exactly the public version and capabilities", async ({ page }) => {
  const response = state(page).response!;
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
  expect(await response.json()).toEqual({ apiVersion: 1, capabilities: ["idempotency-key"] });
});

async function lifecycleInput(page: Page, tripId: string) {
  const current = state(page);
  if (!current.lifecycle) {
    const [day] = await withE2EDb((database) =>
      database
        .select({ id: days.id })
        .from(days)
        .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 1)))
    );
    current.lifecycle = {
      tripId,
      dayId: day.id,
      id: randomUUID(),
      firstItem: { id: randomUUID(), content: "Lifecycle shoes" },
      position: 1,
      title: "Lifecycle packing",
    };
  }
  return current.lifecycle;
}
async function expandLifecycleDay(page: Page) {
  const toggle = page.getByRole("button", { name: /Fri, Jan 1 .*stops/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}
async function sendLifecycleCreate(page: Page, tripId: string, keyed: boolean) {
  const { tripId: requestTrip, ...body } = await lifecycleInput(page, tripId);
  const response = await page.request.post(`/api/v1/trips/${requestTrip}/checklists`, {
    headers: { ...headers(page), ...(keyed ? { "idempotency-key": state(page).key } : {}) },
    data: body,
  });
  state(page).response = response;
  return response;
}
When("I create a checklist with its first item through the lifecycle API concurrently", async ({ page, scenario }) => {
  await lifecycleInput(page, scenario.currentTrip!.id);
  const responses = await Promise.all(
    Array.from({ length: 3 }, () => sendLifecycleCreate(page, scenario.currentTrip!.id, false))
  );
  const bodies: unknown[] = [];
  for (const response of responses) {
    expect(response.status()).toBe(200);
    bodies.push(await response.json());
  }
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toEqual(bodies[0]);
});
Then("lifecycle creation persists once with mixed timeline ordering after reload", async ({ page }) => {
  const input = state(page).lifecycle!;
  await page.reload();
  await expandLifecycleDay(page);
  const result = await withE2EDb(async (database) => {
    const created = await database.select().from(itineraryChecklists).where(eq(itineraryChecklists.id, input.id));
    const items = await database.select().from(checklistItems).where(eq(checklistItems.checklistId, input.id));
    const eventRows = await database
      .select({ position: events.position })
      .from(events)
      .where(eq(events.dayId, input.dayId));
    const noteRows = await database
      .select({ position: itineraryNotes.position })
      .from(itineraryNotes)
      .where(eq(itineraryNotes.dayId, input.dayId));
    const lists = await database
      .select({ position: itineraryChecklists.position })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, input.dayId));
    return { created, items, eventRows, noteRows, lists };
  });
  expect(result.created).toHaveLength(1);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].id).toBe(input.firstItem.id);
  expect(result.eventRows.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([0, 4]);
  expect(result.noteRows.map((entry) => entry.position)).toEqual([2]);
  expect(result.lists.map((entry) => entry.position).sort()).toEqual([1, 3]);
  await expect(page.locator(`#checklist-${input.id}`)).toContainText("Lifecycle packing");
  const timeline = page.getByRole("main").locator('[id^="event-"], [id^="checklist-"], [id^="note-"]');
  await expect(timeline).toHaveCount(5);
  expect(await timeline.evaluateAll((elements) => elements.map((element) => element.id.split("-")[0]))).toEqual([
    "event",
    "checklist",
    "note",
    "checklist",
    "event",
  ]);
  const untouched = state(page).untouchedDay!;
  expect(await timelineSnapshot(untouched.dayId)).toEqual(untouched.before);
});
When("I create another checklist at the lifecycle position", async ({ page }) => {
  const { tripId, dayId, position } = state(page).lifecycle!;
  const response = await page.request.post(`/api/v1/trips/${tripId}/checklists`, {
    headers: headers(page),
    data: { dayId, position, id: randomUUID(), title: "Shifting insert" },
  });
  expect(response.status()).toBe(200);
});
When("I retry the lifecycle checklist creation", async ({ page, scenario }) => {
  await sendLifecycleCreate(page, scenario.currentTrip!.id, false);
});
Then("the lifecycle retry returns the original checklist at its shifted position", async ({ page }) => {
  const input = state(page).lifecycle!;
  const response = state(page).response!;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ id: input.id, tripDayId: input.dayId, position: input.position + 1 });
});
Then("the day holds the original and the shifting checklist once after reload", async ({ page }) => {
  const input = state(page).lifecycle!;
  await page.reload();
  const rows = await withE2EDb((database) =>
    database
      .select({ id: itineraryChecklists.id, position: itineraryChecklists.position })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, input.dayId))
  );
  // The seeded day already holds one checklist: expect it, the original (shifted once) and the shifting insert.
  expect(rows).toHaveLength(3);
  expect(rows.filter((row) => row.id === input.id).map((row) => row.position)).toEqual([input.position + 1]);
  expect(rows.some((row) => row.position === input.position)).toBe(true);
});
When("I reuse the lifecycle checklist UUID with different content", async ({ page }) => {
  const { tripId, ...body } = state(page).lifecycle!;
  const responses = await Promise.all(
    ["Collision one", "Collision two"].map((title) =>
      page.request.post(`/api/v1/trips/${tripId}/checklists`, {
        headers: headers(page),
        data: { ...body, title },
      })
    )
  );
  for (const response of responses) expect(response.status()).toBe(409);
  state(page).response = responses[0];
});
Then("the lifecycle API returns {int}", async ({ page }, status: number) => {
  const response = state(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(Object.keys(body)).toEqual(["error"]);
});
When("I rename, omit and clear the lifecycle checklist title", async ({ page }) => {
  const input = state(page).lifecycle!;
  for (const [body, title] of [
    [{ title: "Renamed lifecycle" }, "Renamed lifecycle"],
    [{}, "Renamed lifecycle"],
    [{ title: null }, undefined],
  ] as const) {
    const response = await page.request.patch(`/api/v1/checklists/${input.id}`, { headers: headers(page), data: body });
    expect(response.status()).toBe(200);
    expect((await response.json()).title).toBe(title);
  }
});
Then("the lifecycle checklist title is cleared after reload", async ({ page }) => {
  await page.reload();
  await expandLifecycleDay(page);
  const input = state(page).lifecycle!;
  const [row] = await withE2EDb((database) =>
    database.select().from(itineraryChecklists).where(eq(itineraryChecklists.id, input.id))
  );
  expect(row.title).toBeNull();
  await expect(page.locator(`#checklist-${input.id}`)).toBeVisible();
  await expect(page.locator(`#checklist-${input.id}`)).not.toContainText("Renamed lifecycle");
});
When("I delete the lifecycle checklist twice", async ({ page }) => {
  const input = state(page).lifecycle!;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await page.request.delete(`/api/v1/checklists/${input.id}`, {
      headers: { ...headers(page), "idempotency-key": state(page).key },
      data: { tripId: input.tripId },
    });
    expect(response.status()).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  const response = await page.request.delete(`/api/v1/checklists/${input.id}`, {
    headers: headers(page),
    data: { tripId: input.tripId },
  });
  expect(response.status()).toBe(204);
});
Then("the lifecycle checklist is absent after reload", async ({ page }) => {
  await page.reload();
  await expandLifecycleDay(page);
  const input = state(page).lifecycle!;
  await expect(page.locator(`#checklist-${input.id}`)).toHaveCount(0);
  const items = await withE2EDb((database) =>
    database.select().from(checklistItems).where(eq(checklistItems.checklistId, input.id))
  );
  expect(items).toHaveLength(0);
});
When("I create a keyed lifecycle checklist", async ({ page, scenario }) => {
  const response = await sendLifecycleCreate(page, scenario.currentTrip!.id, true);
  expect(response.status()).toBe(200);
});
When("I retry the keyed lifecycle creation", async ({ page, scenario }) => {
  await sendLifecycleCreate(page, scenario.currentTrip!.id, true);
});
When("I attempt keyed lifecycle creation", async ({ page, scenario }) => {
  await sendLifecycleCreate(page, scenario.currentTrip!.id, true);
});
Then("lifecycle creation left no rows or timeline shifts", async ({ page }) => {
  const input = state(page).lifecycle!;
  const result = await withE2EDb(async (database) => ({
    lists: await database.select().from(itineraryChecklists).where(eq(itineraryChecklists.dayId, input.dayId)),
    items: await database.select().from(checklistItems).where(eq(checklistItems.id, input.firstItem.id)),
    notes: await database.select().from(itineraryNotes).where(eq(itineraryNotes.dayId, input.dayId)),
  }));
  expect(result.lists).toHaveLength(1);
  expect(result.lists[0].position).toBe(2);
  expect(result.items).toHaveLength(0);
  expect(result.notes[0].position).toBe(1);
});

async function timelineSnapshot(dayId: string) {
  return withE2EDb(async (database) => ({
    events: await database
      .select({ id: events.id, position: events.position })
      .from(events)
      .where(eq(events.dayId, dayId))
      .orderBy(events.id),
    notes: await database
      .select({ id: itineraryNotes.id, position: itineraryNotes.position })
      .from(itineraryNotes)
      .where(eq(itineraryNotes.dayId, dayId))
      .orderBy(itineraryNotes.id),
    checklists: await database
      .select({ id: itineraryChecklists.id, position: itineraryChecklists.position })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, dayId))
      .orderBy(itineraryChecklists.id),
    items: await database
      .select({ id: checklistItems.id, checklistId: checklistItems.checklistId })
      .from(checklistItems)
      .innerJoin(itineraryChecklists, eq(checklistItems.checklistId, itineraryChecklists.id))
      .where(eq(itineraryChecklists.dayId, dayId))
      .orderBy(checklistItems.id),
  }));
}
When(
  "I concurrently create lifecycle checklists in distinct trips sharing a {string} UUID",
  async ({ page, scenario }, resource: string) => {
    const sharedId = randomUUID();
    const requests = [];
    const before = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { trip } = await scenario.materialize({
        trip: {
          mother: "threeDayTrip",
          setCurrent: false,
          overrides: {
            events: [
              { name: "Race before", dayNumber: 1, position: 0 },
              { name: "Race after", dayNumber: 1, position: 2 },
            ],
            notes: [{ content: "Race note", dayNumber: 1, position: 1 }],
            checklists: [
              { title: "Race baseline", dayNumber: 1, position: 3, items: [{ text: "Baseline item", position: 0 }] },
            ],
          },
        },
      });
      if (!trip) throw new Error("Race trip materialization failed");
      const [day] = await withE2EDb((database) =>
        database
          .select({ id: days.id })
          .from(days)
          .where(and(eq(days.tripId, trip.id), eq(days.dayNumber, 1)))
      );
      const checklistId = resource === "checklist" ? sharedId : randomUUID();
      const firstItemId = resource === "first-item" ? sharedId : randomUUID();
      requests.push({
        tripId: trip.id,
        body: {
          dayId: day.id,
          position: 1,
          id: attempt === 1 ? checklistId.toUpperCase() : checklistId,
          title: "Race created",
          firstItem: { id: attempt === 1 ? firstItemId.toUpperCase() : firstItemId, content: "Race item" },
        },
      });
      before.push(await timelineSnapshot(day.id));
    }
    const responses = await Promise.all(
      requests.map((request) =>
        page.request.post(`/api/v1/trips/${request.tripId}/checklists`, { headers: headers(page), data: request.body })
      )
    );
    const statuses = responses.map((response) => response.status());
    for (const response of responses) {
      expect(response.headers()["cache-control"]).toBe("no-store");
      if (response.status() === 409) expect((await response.json()).error.code).toBe("conflict");
    }
    scenario.setValue("lifecycle-race", { requests, before, statuses });
  }
);
Then("the cross-trip lifecycle collision has one winner and an untouched loser", async ({ scenario }) => {
  const race = scenario.getValue<{
    requests: { tripId: string; body: { dayId: string; id: string; firstItem: { id: string } } }[];
    before: Awaited<ReturnType<typeof timelineSnapshot>>[];
    statuses: number[];
  }>("lifecycle-race")!;
  expect([...race.statuses].sort()).toEqual([200, 409]);
  const winner = race.statuses.indexOf(200);
  const loser = race.statuses.indexOf(409);
  expect(await timelineSnapshot(race.requests[loser].body.dayId)).toEqual(race.before[loser]);
  const committed = await timelineSnapshot(race.requests[winner].body.dayId);
  expect(committed.checklists).toHaveLength(race.before[winner].checklists.length + 1);
  expect(committed.items).toHaveLength(race.before[winner].items.length + 1);
  expect(committed.checklists.find((entry) => entry.id === race.requests[winner].body.id.toLowerCase())?.position).toBe(
    1
  );
  expect(committed.items.some((entry) => entry.id === race.requests[winner].body.firstItem.id.toLowerCase())).toBe(
    true
  );
  expect(committed.events.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([0, 3]);
  expect(committed.notes.map((entry) => entry.position)).toEqual([2]);
  expect(committed.checklists.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([1, 4]);
});

// Checklist item lifecycle (create, partial update, delete) over the API.
interface ItemApiState {
  tripId: string;
  checklistId: string;
  id: string;
  content: string;
  countBefore?: number;
}
const itemApiStates = new WeakMap<Page, ItemApiState>();
function itemApi(page: Page): ItemApiState {
  const value = itemApiStates.get(page);
  if (!value) throw new Error("Item API state missing");
  return value;
}
function itemsUrl(checklistId: string) {
  return `/api/v1/checklists/${checklistId}/items`;
}
async function ensureItemApi(page: Page, tripId: string): Promise<ItemApiState> {
  const existing = itemApiStates.get(page);
  if (existing) return existing;
  const [checklist] = await withE2EDb((database) =>
    database
      .select({ id: itineraryChecklists.id })
      .from(itineraryChecklists)
      .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
      .where(and(eq(days.tripId, tripId), eq(itineraryChecklists.title, "API packing")))
  );
  const created = { tripId, checklistId: checklist.id, id: randomUUID(), content: "API created item" };
  itemApiStates.set(page, created);
  return created;
}
async function storedItems(checklistId: string) {
  const rows = await withE2EDb((database) =>
    database.select().from(checklistItems).where(eq(checklistItems.checklistId, checklistId))
  );
  return rows.sort((left, right) => (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0));
}
async function expandPackingChecklist(page: Page) {
  const toggle = page
    .locator("button")
    .filter({ hasText: /\d+ stops/ })
    .first();
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  const checklist = page.locator('[id^="checklist-"]').filter({ hasText: "API packing" });
  if (!(await checklist.getByPlaceholder("Add an item…").isVisible()))
    await checklist.getByRole("button").first().click();
  return checklist;
}

When("I create a checklist item with a client UUID concurrently", async ({ page, scenario }) => {
  const item = await ensureItemApi(page, scenario.currentTrip!.id);
  const responses = await Promise.all(
    [item.id, item.id.toUpperCase(), item.id].map((id) =>
      page.request.post(itemsUrl(item.checklistId), {
        headers: headers(page),
        data: { id, content: ` ${item.content} ` },
      })
    )
  );
  const bodies: unknown[] = [];
  for (const response of responses) {
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    bodies.push(await response.json());
  }
  expect(bodies[0]).toMatchObject({
    id: item.id,
    checklistId: item.checklistId,
    content: item.content,
    isChecked: false,
  });
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toEqual(bodies[0]);
});
Then("the checklist item persists once after the original item after reload", async ({ page }) => {
  const item = itemApi(page);
  await page.reload();
  const checklist = await expandPackingChecklist(page);
  const rows = await storedItems(item.checklistId);
  expect(rows.map((row) => row.content)).toEqual(["API passport", item.content]);
  expect(rows.filter((row) => row.id === item.id)).toHaveLength(1);
  const shown = checklist.locator("[data-checklist-item-id]");
  await expect(shown).toHaveCount(2);
  expect(await shown.evaluateAll((elements) => elements.map((element) => element.textContent?.trim()))).toEqual([
    "API passport",
    item.content,
  ]);
});
When("I reuse the checklist item UUID with different content", async ({ page }) => {
  const item = itemApi(page);
  const responses = await Promise.all(
    ["Collision one", "Collision two"].map((content) =>
      page.request.post(itemsUrl(item.checklistId), { headers: headers(page), data: { id: item.id, content } })
    )
  );
  for (const response of responses) expect(response.status()).toBe(409);
  state(page).response = responses[0];
});
Then("the checklist item keeps its original content", async ({ page }) => {
  const item = itemApi(page);
  const rows = await storedItems(item.checklistId);
  expect(rows.map((row) => row.content)).toEqual(["API passport", item.content]);
});
When(
  "I concurrently create checklist items in distinct trips sharing a {string} UUID",
  async ({ page, scenario }, resource: string) => {
    const sharedId = randomUUID();
    const trips: { tripId: string; dayId: string; checklistId: string }[] = [];
    const before = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { trip } = await scenario.materialize({
        trip: {
          mother: "threeDayTrip",
          setCurrent: false,
          overrides: {
            checklists: [
              { title: "Race baseline", dayNumber: 1, position: 0, items: [{ text: "Baseline item", position: 0 }] },
            ],
          },
        },
      });
      if (!trip) throw new Error("Race trip materialization failed");
      const [row] = await withE2EDb((database) =>
        database
          .select({ dayId: days.id, checklistId: itineraryChecklists.id })
          .from(itineraryChecklists)
          .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
          .where(eq(days.tripId, trip.id))
      );
      trips.push({ tripId: trip.id, dayId: row.dayId, checklistId: row.checklistId });
      before.push(await timelineSnapshot(row.dayId));
    }
    const sendItem = (target: (typeof trips)[number], id: string) =>
      page.request.post(itemsUrl(target.checklistId), { headers: headers(page), data: { id, content: "Race item" } });
    const responses = await Promise.all([
      sendItem(trips[0], sharedId),
      resource === "item"
        ? sendItem(trips[1], sharedId.toUpperCase())
        : page.request.post(`/api/v1/trips/${trips[1].tripId}/checklists`, {
            headers: headers(page),
            data: {
              dayId: trips[1].dayId,
              position: 1,
              firstItem: { id: sharedId.toUpperCase(), content: "Race item" },
            },
          }),
    ]);
    const statuses = responses.map((response) => response.status());
    for (const response of responses) {
      expect(response.headers()["cache-control"]).toBe("no-store");
      if (response.status() === 409) expect((await response.json()).error.code).toBe("conflict");
    }
    scenario.setValue("item-race", { sharedId, trips, before, statuses });
  }
);
Then("the cross-trip item collision has one winner and an untouched loser", async ({ scenario }) => {
  const race = scenario.getValue<{
    sharedId: string;
    trips: { tripId: string; dayId: string; checklistId: string }[];
    before: Awaited<ReturnType<typeof timelineSnapshot>>[];
    statuses: number[];
  }>("item-race")!;
  expect([...race.statuses].sort()).toEqual([200, 409]);
  const loser = race.statuses.indexOf(409);
  expect(await timelineSnapshot(race.trips[loser].dayId)).toEqual(race.before[loser]);
  const owners = await withE2EDb((database) =>
    database.select({ id: checklistItems.id }).from(checklistItems).where(eq(checklistItems.id, race.sharedId))
  );
  expect(owners).toHaveLength(1);
});
When("I patch the checklist item content, checked state and an empty body", async ({ page, scenario }) => {
  const item = await ensureItemApi(page, scenario.currentTrip!.id);
  const url = itemUrl(state(page).itemId);
  const patch = async (data: unknown, status: number) => {
    const response = await page.request.patch(url, { headers: headers(page), data });
    expect(response.status()).toBe(status);
    return response;
  };
  expect(await (await patch({ content: " Renamed passport " }, 200)).json()).toMatchObject({
    content: "Renamed passport",
    isChecked: false,
  });
  expect(await (await patch({ isChecked: true }, 200)).json()).toMatchObject({
    content: "Renamed passport",
    isChecked: true,
  });
  expect(await (await patch({}, 200)).json()).toMatchObject({ content: "Renamed passport", isChecked: true });
  for (const invalid of [{ content: "   " }, { content: "x".repeat(301) }, { unknown: true }, { isChecked: null }]) {
    const response = await patch(invalid, 422);
    expect((await response.json()).error.code).toBe("validation_failed");
  }
  const rows = await storedItems(item.checklistId);
  expect(rows).toMatchObject([{ content: "Renamed passport", isChecked: true }]);
});
When("I resend the same checklist item content and checked state", async ({ page }) => {
  const response = await page.request.patch(itemUrl(state(page).itemId), {
    headers: headers(page),
    data: { content: "Renamed passport", isChecked: true },
  });
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ content: "Renamed passport", isChecked: true });
});
Then("the checklist item has the patched content and checked state after reload", async ({ page }) => {
  await page.reload();
  const checklist = await expandPackingChecklist(page).catch(() => undefined);
  const [row] = await storedItems(itemApi(page).checklistId);
  expect(row).toMatchObject({ content: "Renamed passport", isChecked: true });
  if (checklist) await expect(checklist.getByLabel("Complete")).toBeVisible();
});
When("I delete the checklist item with the wrong trip and then twice", async ({ page, scenario }) => {
  const itemId = state(page).itemId;
  await ensureItemApi(page, scenario.currentTrip!.id);
  const { trip: otherTrip } = await scenario.materialize({ trip: { mother: "threeDayTrip", setCurrent: false } });
  const wrongTrip = await page.request.delete(itemUrl(itemId), {
    headers: headers(page),
    data: { tripId: otherTrip!.id },
  });
  expect(wrongTrip.status()).toBe(404);
  expect((await wrongTrip.json()).error.code).toBe("not_found");
  expect(await storedItems(itemApi(page).checklistId)).toHaveLength(1);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await page.request.delete(itemUrl(itemId), {
      headers: { ...headers(page), "idempotency-key": state(page).key },
      data: { tripId: scenario.currentTrip!.id },
    });
    expect(response.status()).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  const unkeyed = await page.request.delete(itemUrl(itemId), {
    headers: headers(page),
    data: { tripId: scenario.currentTrip!.id },
  });
  expect(unkeyed.status()).toBe(204);
});
Then("the checklist item is absent after reload", async ({ page }) => {
  await page.reload();
  expect(await storedItems(itemApi(page).checklistId)).toHaveLength(0);
  await expect(page.locator(`[data-checklist-item-id="${state(page).itemId}"]`)).toHaveCount(0);
});
When("I attempt the checklist item API operation {string}", async ({ page, scenario }, operation: string) => {
  const item = await ensureItemApi(page, scenario.currentTrip!.id);
  item.countBefore = (await storedItems(item.checklistId)).length;
  const requestHeaders = headers(page);
  state(page).response =
    operation === "create"
      ? await page.request.post(itemsUrl(item.checklistId), {
          headers: requestHeaders,
          data: { id: item.id, content: item.content },
        })
      : await page.request.delete(itemUrl(state(page).itemId), {
          headers: requestHeaders,
          data: { tripId: item.tripId },
        });
});
Then(
  "the checklist item API returns {int} with code {string} and the item list is unchanged",
  async ({ page }, status: number, code: string) => {
    const response = state(page).response!;
    expect(response.status()).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const item = itemApi(page);
    const rows = await storedItems(item.checklistId);
    expect(rows).toHaveLength(item.countBefore!);
    expect(rows.some((row) => row.id === item.id)).toBe(false);
    expect(rows.some((row) => row.id === state(page).itemId)).toBe(true);
  }
);
When("I send {int} keyed checklist item creations one after another", async ({ page, scenario }, count: number) => {
  const item = await ensureItemApi(page, scenario.currentTrip!.id);
  const bodies: unknown[] = [];
  for (let attempt = 0; attempt < count; attempt += 1) {
    const response = await page.request.post(itemsUrl(item.checklistId), {
      headers: { ...headers(page), "idempotency-key": state(page).key },
      data: { id: item.id, content: item.content },
    });
    expect(response.status()).toBe(200);
    bodies.push(await response.json());
  }
  for (const body of bodies) expect(body).toEqual(bodies[0]);
});
Then("exactly one checklist item was created for that key", async ({ page }) => {
  const item = itemApi(page);
  const rows = await storedItems(item.checklistId);
  expect(rows.filter((row) => row.id === item.id)).toHaveLength(1);
  expect(rows).toHaveLength(2);
});
When("I reuse the item creation key with different content", async ({ page }) => {
  const item = itemApi(page);
  item.countBefore = (await storedItems(item.checklistId)).length;
  state(page).response = await page.request.post(itemsUrl(item.checklistId), {
    headers: { ...headers(page), "idempotency-key": state(page).key },
    data: { content: "A different item" },
  });
});
Then("the checklist item API returns 409 with code {string} and no new item", async ({ page }, code: string) => {
  const response = state(page).response!;
  expect(response.status()).toBe(409);
  expect((await response.json()).error.code).toBe(code);
  const item = itemApi(page);
  expect(await storedItems(item.checklistId)).toHaveLength(item.countBefore!);
});
When("I retry the keyed checklist item creation", async ({ page }) => {
  const item = itemApi(page);
  item.countBefore = (await storedItems(item.checklistId)).length;
  state(page).response = await page.request.post(itemsUrl(item.checklistId), {
    headers: { ...headers(page), "idempotency-key": state(page).key },
    data: { id: item.id, content: item.content },
  });
});
Then(
  "the checklist item retry returns {int} with code {string} and no extra item",
  async ({ page }, status: number, code: string) => {
    const response = state(page).response!;
    expect(response.status()).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    const item = itemApi(page);
    expect(await storedItems(item.checklistId)).toHaveLength(item.countBefore!);
  }
);

// Packing-source checklist creation over the API.
type PackingSourceType = "template" | "packing-list";
interface SourceApiState {
  tripId: string;
  dayId: string;
  checklistId: string;
  position: number;
  source: { type: PackingSourceType; id: string };
  title: string;
  /** Non-label item text in source position order. */
  contents: string[];
  before: Awaited<ReturnType<typeof timelineSnapshot>>;
  first?: unknown;
  retry?: KeyedResult;
  /** Another trip's day and timeline, for the wrong-trip cases. */
  other?: { dayId: string; before: Awaited<ReturnType<typeof timelineSnapshot>> };
  secretName?: string;
}
const sourceApiStates = new WeakMap<Page, SourceApiState>();
function sourceApi(page: Page): SourceApiState {
  const value = sourceApiStates.get(page);
  if (!value) throw new Error("Packing source API state missing");
  return value;
}
// Seed order differs from position order, and a label sits among the items, so ordering and label exclusion both show.
const SOURCE_ENTRIES = [
  { text: "Charger", isLabel: false, position: 3 },
  { text: "Passport copy", isLabel: false, position: 1 },
  { text: "Documents", isLabel: true, position: 0 },
  { text: "Adapter", isLabel: false, position: 2 },
];
const SOURCE_CONTENTS = ["Passport copy", "Adapter", "Charger"];
async function dayOneId(tripId: string): Promise<string> {
  const [day] = await withE2EDb((database) =>
    database
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 1)))
  );
  return day.id;
}
async function seedPackingList(tripId: string, name: string): Promise<string> {
  return withE2EDb(async (database) => {
    const [list] = await database
      .insert(tripPackingLists)
      .values({ tripId, name, position: 0 })
      .returning({ id: tripPackingLists.id });
    await database.insert(packingItems).values(
      SOURCE_ENTRIES.map((entry) => ({
        tripId,
        listId: list.id,
        name: entry.text,
        isLabel: entry.isLabel,
        position: entry.position,
      }))
    );
    return list.id;
  });
}
async function sourceItemsInOrder(checklistId: string): Promise<{ content: string; isChecked: boolean }[]> {
  return withE2EDb((database) =>
    database
      .select({ content: checklistItems.content, isChecked: checklistItems.isChecked })
      .from(checklistItems)
      .where(eq(checklistItems.checklistId, checklistId))
      .orderBy(checklistItems.createdAt)
  );
}
function postSourceCreate(page: Page, input: SourceApiState, key?: string) {
  return page.request.post(`/api/v1/trips/${input.tripId}/checklists`, {
    headers: { ...headers(page), ...(key ? { "idempotency-key": key } : {}) },
    data: { dayId: input.dayId, position: input.position, id: input.checklistId, source: input.source },
  });
}
Given("a scenario-owned {string} packing source", async ({ page, scenario }, type: string) => {
  const tripId = scenario.currentTrip!.id;
  const title = `API ${type} source`;
  let sourceId: string;
  if (type === "template") {
    const { template } = await scenario.materialize({
      template: { overrides: { template: { name: title }, items: SOURCE_ENTRIES }, setCurrent: false },
    });
    sourceId = template!.id;
  } else {
    sourceId = await seedPackingList(tripId, title);
  }
  const dayId = await dayOneId(tripId);
  sourceApiStates.set(page, {
    tripId,
    dayId,
    checklistId: randomUUID(),
    position: 1,
    source: { type: type as PackingSourceType, id: sourceId },
    title,
    contents: SOURCE_CONTENTS,
    before: await timelineSnapshot(dayId),
  });
});
When(
  "I create a checklist from that source through the API {int} times concurrently",
  async ({ page }, count: number) => {
    const input = sourceApi(page);
    const responses = await Promise.all(Array.from({ length: count }, () => postSourceCreate(page, input)));
    const bodies: { title: string; position: number; items: { content: string; isChecked: boolean }[] }[] = [];
    for (const response of responses) {
      expect(response.status()).toBe(200);
      bodies.push(await response.json());
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    input.first = bodies[0];
    expect(bodies[0]).toMatchObject({ id: input.checklistId, title: input.title, position: 1 });
    expect(bodies[0].items.map((item) => [item.content, item.isChecked])).toEqual(
      input.contents.map((content) => [content, false])
    );
  }
);
Then(
  "the source checklist persists once with ordered unchecked items and shifted timeline after reload",
  async ({ page }) => {
    const input = sourceApi(page);
    await page.reload();
    await expandLifecycleDay(page);
    const result = await withE2EDb(async (database) => ({
      created: await database.select().from(itineraryChecklists).where(eq(itineraryChecklists.id, input.checklistId)),
      eventRows: await database.select({ position: events.position }).from(events).where(eq(events.dayId, input.dayId)),
      noteRows: await database
        .select({ position: itineraryNotes.position })
        .from(itineraryNotes)
        .where(eq(itineraryNotes.dayId, input.dayId)),
      lists: await database
        .select({ position: itineraryChecklists.position })
        .from(itineraryChecklists)
        .where(eq(itineraryChecklists.dayId, input.dayId)),
    }));
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ title: input.title, position: 1, dayId: input.dayId });
    expect(await sourceItemsInOrder(input.checklistId)).toEqual(
      input.contents.map((content) => ({ content, isChecked: false }))
    );
    expect(result.eventRows.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([0, 4]);
    expect(result.noteRows.map((entry) => entry.position)).toEqual([2]);
    expect(result.lists.map((entry) => entry.position).sort((left, right) => left - right)).toEqual([1, 3]);
    await expect(page.locator(`#checklist-${input.checklistId}`)).toContainText(input.title);
  }
);
When("I append an item to the source checklist through the API", async ({ page }) => {
  const input = sourceApi(page);
  const response = await page.request.post(`/api/v1/checklists/${input.checklistId}/items`, {
    headers: headers(page),
    data: { content: "Late addition" },
  });
  expect(response.status()).toBe(200);
});
Then("the appended item sorts after every copied item", async ({ page }) => {
  const input = sourceApi(page);
  expect((await sourceItemsInOrder(input.checklistId)).map((item) => item.content)).toEqual([
    ...input.contents,
    "Late addition",
  ]);
});
When("I reuse the source checklist UUID at a different position", async ({ page }) => {
  const input = sourceApi(page);
  state(page).response = await postSourceCreate(page, { ...input, position: 3 });
});
Then("the source checklist keeps its single set of items", async ({ page }) => {
  const input = sourceApi(page);
  // The copied items plus the one appended earlier in the scenario; the rejected reuse added none.
  expect(await sourceItemsInOrder(input.checklistId)).toHaveLength(input.contents.length + 1);
});
When("I create a keyed checklist from that source", async ({ page }) => {
  const input = sourceApi(page);
  const response = await postSourceCreate(page, input, state(page).key);
  expect(response.status()).toBe(200);
  input.first = await response.json();
});
When("the packing source is renamed", async ({ page }) => {
  const input = sourceApi(page);
  await withE2EDb(async (database) => {
    if (input.source.type === "template")
      await database
        .update(packingTemplates)
        .set({ name: "Renamed source" })
        .where(eq(packingTemplates.id, input.source.id));
    else
      await database
        .update(tripPackingLists)
        .set({ name: "Renamed source" })
        .where(eq(tripPackingLists.id, input.source.id));
  });
});
When("the packing source is deleted", async ({ page }) => {
  const input = sourceApi(page);
  await withE2EDb(async (database) => {
    if (input.source.type === "template")
      await database.delete(packingTemplates).where(eq(packingTemplates.id, input.source.id));
    else await database.delete(tripPackingLists).where(eq(tripPackingLists.id, input.source.id));
  });
});
When("I retry the keyed source creation", async ({ page }) => {
  const input = sourceApi(page);
  const response = await postSourceCreate(page, input, state(page).key);
  state(page).response = response;
  input.retry = { status: response.status(), body: await response.json().catch(() => null) };
});
Then("the keyed source retry returns the original checklist and no extra rows", async ({ page }) => {
  const input = sourceApi(page);
  expect(input.retry?.status).toBe(200);
  expect(input.retry?.body).toEqual(input.first);
  expect((input.retry!.body as { title: string }).title).toBe(input.title);
  const rows = await withE2EDb((database) =>
    database
      .select({ id: itineraryChecklists.id })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, input.dayId))
  );
  expect(rows.filter((row) => row.id === input.checklistId)).toHaveLength(1);
  expect(await sourceItemsInOrder(input.checklistId)).toHaveLength(input.contents.length);
});
Then("the keyed source retry is concealed as {int} and leaks no cached checklist", async ({ page }, status: number) => {
  const input = sourceApi(page);
  const response = state(page).response!;
  expect(response.status()).toBe(status);
  const text = await response.text();
  expect(text).not.toContain(input.title);
  expect(text).not.toContain(input.checklistId);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
When("I attempt a source checklist creation", async ({ page }) => {
  state(page).response = await postSourceCreate(page, sourceApi(page));
});
When("I attempt a source checklist creation with a {string} source", async ({ page, scenario }, scope: string) => {
  const input = sourceApi(page);
  if (scope === "foreign-template") {
    const { user: stranger } = await scenario.materialize({ user: { setCurrent: false } });
    input.secretName = "Foreign secret template";
    const { template } = await scenario.materialize({
      template: {
        userId: stranger!.id,
        overrides: { template: { name: input.secretName }, items: SOURCE_ENTRIES },
        setCurrent: false,
      },
    });
    input.source = { type: "template", id: template!.id };
  } else if (scope === "missing-template") {
    input.source = { type: "template", id: randomUUID() };
  } else {
    const { trip: other } = await scenario.materialize({
      trip: { mother: "threeDayTrip", setCurrent: false },
    });
    const otherDayId = await dayOneId(other!.id);
    input.other = { dayId: otherDayId, before: await timelineSnapshot(otherDayId) };
    if (scope === "other-trip-list") {
      input.secretName = "Other trip list";
      input.source = { type: "packing-list", id: await seedPackingList(other!.id, input.secretName) };
    } else {
      input.dayId = otherDayId;
    }
  }
  state(page).response = await postSourceCreate(page, input);
});
Then("the source creation changed no rows or positions", async ({ page }) => {
  const input = sourceApi(page);
  const response = state(page).response!;
  expect(response.headers()["cache-control"]).toBe("no-store");
  if (input.secretName) expect(await response.text()).not.toContain(input.secretName);
  expect(await timelineSnapshot(await dayOneId(input.tripId))).toEqual(input.before);
  if (input.other) expect(await timelineSnapshot(input.other.dayId)).toEqual(input.other.before);
  expect(await sourceItemsInOrder(input.checklistId)).toEqual([]);
});

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
    state(page).response = await page.request.fetch(request.url, {
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
    const send = (data: unknown) =>
      page.request.fetch(plan.url, {
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

// ── Event edit API ──────────────────────────────────────────────────────────
interface EventApiState {
  ids: { scheduled: string; "day-less": string };
  response?: APIResponse;
  keyedBodies: unknown[];
  key: string;
}
const eventStates = new WeakMap<Page, EventApiState>();
function eventState(page: Page): EventApiState {
  const value = eventStates.get(page);
  if (!value) throw new Error("Event API fixture missing");
  return value;
}
function eventKind(kind: string): "scheduled" | "day-less" {
  if (kind !== "scheduled" && kind !== "day-less") throw new Error(`Unknown event kind "${kind}".`);
  return kind;
}
Given("scenario-owned scheduled and day-less events for the event API", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  const ids = await withE2EDb(async (database) => {
    const [day] = await database
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 1)));
    const [scheduled] = await database
      .insert(events)
      .values({
        tripId,
        dayId: day.id,
        name: "API dinner",
        position: 10,
        startAt: new Date("2026-08-02T19:00:00.000Z"),
        locationName: "API bistro",
        locationAddress: "1 API St",
        note: "API note",
        confirmationNumber: "API123",
      })
      .returning({ id: events.id });
    const [dayLess] = await database
      .insert(events)
      .values({ tripId, dayId: null, name: "API floating", position: 0, note: "API float note" })
      .returning({ id: events.id });
    return { scheduled: scheduled.id, "day-less": dayLess.id };
  });
  eventStates.set(page, { ids, keyedBodies: [], key: `e2e-event-${randomUUID()}` });
});
function eventUrl(eventId: string) {
  return `/api/v1/events/${eventId}`;
}
When("I patch the {string} event through the event API with:", async ({ page }, kind: string, body: string) => {
  const current = eventState(page);
  current.response = await page.request.patch(eventUrl(current.ids[eventKind(kind)]), {
    headers: headers(page),
    data: JSON.parse(body),
  });
});
When("I submit event API case {string}", async ({ page }, testCase: string) => {
  const current = eventState(page);
  const bodies: Record<string, unknown> = {
    "blank-name": { name: "   " },
    "null-name": { name: null },
    "bad-latitude": { locationLat: 91 },
    "unknown-key": { colour: "red" },
    "position-key": { position: 3 },
  };
  let eventId = current.ids.scheduled;
  if (testCase === "linked-id") eventId = `linked-${randomUUID()}`;
  if (testCase === "malformed-id") eventId = "not-a-uuid";
  current.response = await page.request.patch(eventUrl(eventId), {
    headers: headers(page),
    data: bodies[testCase] ?? { name: "Valid name" },
  });
});
Then("the event API returns {int}", async ({ page }, status: number) => {
  const response = eventState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the event API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = eventState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
async function storedEvent(eventId: string) {
  const [row] = await withE2EDb((database) => database.select().from(events).where(eq(events.id, eventId)));
  return {
    name: row.name,
    note: row.note,
    dayId: row.dayId,
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    locationName: row.locationName,
    locationAddress: row.locationAddress,
    locationLat: row.locationLat,
    locationLng: row.locationLng,
    confirmationNumber: row.confirmationNumber,
  };
}
Then("the {string} event is stored as:", async ({ page }, kind: string, expected: string) => {
  expect(await storedEvent(eventState(page).ids[eventKind(kind)])).toMatchObject(JSON.parse(expected));
});
Then("after reload the {string} event is stored as:", async ({ page }, kind: string, expected: string) => {
  await page.reload();
  expect(await storedEvent(eventState(page).ids[eventKind(kind)])).toMatchObject(JSON.parse(expected));
});
When("I send the keyed {string} event edit {string} twice", async ({ page }, kind: string, name: string) => {
  const current = eventState(page);
  current.keyedBodies = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await page.request.patch(eventUrl(current.ids[eventKind(kind)]), {
      headers: { ...headers(page), "idempotency-key": current.key },
      data: { name },
    });
    expect(response.status()).toBe(200);
    current.keyedBodies.push(await response.json());
  }
});
Then("both keyed event edits return identical JSON naming {string}", async ({ page }, name: string) => {
  const [first, second] = eventState(page).keyedBodies as { name: string }[];
  expect(second).toEqual(first);
  expect(first.name).toBe(name);
});
When("I reuse the event edit key with the name {string}", async ({ page }, name: string) => {
  const current = eventState(page);
  current.response = await page.request.patch(eventUrl(current.ids.scheduled), {
    headers: { ...headers(page), "idempotency-key": current.key },
    data: { name },
  });
});

// ── Day order API ───────────────────────────────────────────────────────────
interface DayItem {
  type: "event" | "note" | "checklist";
  id: string;
}
interface DayOrderState {
  tripId: string;
  dayId: string;
  original: DayItem[];
  foreign: DayItem;
  response?: APIResponse;
  key: string;
}
const dayOrderStates = new WeakMap<Page, DayOrderState>();
function dayOrderState(page: Page): DayOrderState {
  const value = dayOrderStates.get(page);
  if (!value) throw new Error("Day order API fixture missing");
  return value;
}
/** The day's events, notes and checklists in stored position order, as the order endpoint names them. */
async function storedDayOrder(dayId: string): Promise<DayItem[]> {
  const [eventRows, noteRows, checklistRows] = await withE2EDb((database) =>
    Promise.all([
      database.select({ id: events.id, position: events.position }).from(events).where(eq(events.dayId, dayId)),
      database
        .select({ id: itineraryNotes.id, position: itineraryNotes.position })
        .from(itineraryNotes)
        .where(eq(itineraryNotes.dayId, dayId)),
      database
        .select({ id: itineraryChecklists.id, position: itineraryChecklists.position })
        .from(itineraryChecklists)
        .where(eq(itineraryChecklists.dayId, dayId)),
    ])
  );
  return [
    ...eventRows.map((row) => ({ type: "event" as const, id: row.id, position: row.position })),
    ...noteRows.map((row) => ({ type: "note" as const, id: row.id, position: row.position })),
    ...checklistRows.map((row) => ({ type: "checklist" as const, id: row.id, position: row.position })),
  ]
    .sort((first, second) => first.position - second.position)
    .map(({ type, id }) => ({ type, id }));
}
Given("the mixed day for the day order API", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  const [dayOne, dayTwo] = await withE2EDb((database) =>
    database.select({ id: days.id }).from(days).where(eq(days.tripId, tripId)).orderBy(days.dayNumber)
  );
  const original = await storedDayOrder(dayOne.id);
  const [foreign] = await storedDayOrder(dayTwo.id);
  // The foreign-item cases borrow a day 2 item; an empty day 2 would send malformed bodies, not 409 cases.
  expect(foreign).toBeDefined();
  // The API fixture holds an event, a note and a checklist on day 1, plus a second event: four mixed items.
  expect(original.map((item) => item.type)).toEqual(["event", "note", "checklist", "event"]);
  dayOrderStates.set(page, { tripId, dayId: dayOne.id, original, foreign, key: `e2e-day-order-${randomUUID()}` });
});
async function putDayOrder(page: Page, items: DayItem[], key?: string) {
  const current = dayOrderState(page);
  // A page request in flight when the Given cleared the cookies can set them again before this send; clear at the send.
  if (state(page).role === "anonymous") await page.context().clearCookies();
  current.response = await page.request.put(`/api/v1/days/${current.dayId}/order`, {
    headers: key ? { ...headers(page), "idempotency-key": key } : headers(page),
    data: { items },
  });
}
When("I PUT the reversed day order", async ({ page }) => {
  await putDayOrder(page, [...dayOrderState(page).original].reverse());
});
When("I PUT the reversed day order with an Idempotency-Key", async ({ page }) => {
  const current = dayOrderState(page);
  await putDayOrder(page, [...current.original].reverse(), current.key);
});
When("I PUT the stored day order", async ({ page }) => {
  await putDayOrder(page, dayOrderState(page).original);
});
When("I PUT the day order case {string}", async ({ page }, testCase: string) => {
  const { original, foreign } = dayOrderState(page);
  const cases: Record<string, DayItem[]> = {
    "missing-item": original.slice(0, -1),
    "extra-item": [...original, foreign],
    "foreign-item": [...original.slice(0, -1), foreign],
    "wrong-type": [{ ...original[0], type: "note" }, ...original.slice(1)],
    duplicate: [...original, original[0]],
  };
  await putDayOrder(page, cases[testCase]);
});
When("another editor stores the original day order directly", async ({ page }) => {
  const { original } = dayOrderState(page);
  await withE2EDb(async (database) => {
    for (const [index, item] of original.entries()) {
      const table = { event: events, note: itineraryNotes, checklist: itineraryChecklists }[item.type];
      await database.update(table).set({ position: index }).where(eq(table.id, item.id));
    }
  });
});
When("I retry the same keyed day order PUT", async ({ page }) => {
  const current = dayOrderState(page);
  await putDayOrder(page, [...current.original].reverse(), current.key);
});
Then("the day order API returns {int}", async ({ page }, status: number) => {
  const response = dayOrderState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the day order API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = dayOrderState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
Then("the day order API response lists the reversed order", async ({ page }) => {
  const current = dayOrderState(page);
  expect(await current.response!.json()).toEqual({ dayId: current.dayId, items: [...current.original].reverse() });
});
Then("after reload the day stores the reversed order", async ({ page }) => {
  const current = dayOrderState(page);
  await page.reload();
  expect(await storedDayOrder(current.dayId)).toEqual([...current.original].reverse());
});
Then("the day stores the original order", async ({ page }) => {
  const current = dayOrderState(page);
  expect(await storedDayOrder(current.dayId)).toEqual(current.original);
});
Then("the untouched day is unchanged", async ({ page }) => {
  const untouched = state(page).untouchedDay!;
  expect(await timelineSnapshot(untouched.dayId)).toEqual(untouched.before);
});

// ── Event create API ────────────────────────────────────────────────────────
interface EventCreateState {
  response?: APIResponse;
  clientId?: string;
  retryBody?: Record<string, unknown>;
  keyedBodies: unknown[];
}
const eventCreateStates = new WeakMap<Page, EventCreateState>();
function eventCreateState(page: Page): EventCreateState {
  let current = eventCreateStates.get(page);
  if (!current) {
    current = { keyedBodies: [] };
    eventCreateStates.set(page, current);
  }
  return current;
}
async function postDayEvent(page: Page, body: unknown, options: { key?: string; dayId?: string } = {}) {
  // A page request in flight when the Given cleared the cookies can set them again before this send; clear at the send.
  if (state(page).role === "anonymous") await page.context().clearCookies();
  const response = await page.request.post(`/api/v1/days/${options.dayId ?? dayOrderState(page).dayId}/events`, {
    headers: options.key ? { ...headers(page), "idempotency-key": options.key } : headers(page),
    data: body,
  });
  eventCreateState(page).response = response;
  return response;
}
async function eventsNamed(dayId: string, name: string) {
  return withE2EDb((database) =>
    database
      .select({ id: events.id, position: events.position })
      .from(events)
      .where(and(eq(events.dayId, dayId), eq(events.name, name)))
  );
}
When("I create the event {string} after the first event through the day API", async ({ page }, name: string) => {
  await postDayEvent(page, { name, afterEventId: dayOrderState(page).original[0].id });
});
When(
  "I create the event {string} at position {int} through the day API",
  async ({ page }, name: string, position: number) => {
    await postDayEvent(page, { name, insertAtPosition: position });
  }
);
When("I create the event {string} at the end through the day API", async ({ page }, name: string) => {
  await postDayEvent(page, { name });
});
When("I create the event {string} on a day that no longer exists", async ({ page }, name: string) => {
  await postDayEvent(page, { name }, { dayId: randomUUID() });
});
Then("the event create API returns {int}", async ({ page }, status: number) => {
  const response = eventCreateState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the event create API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = eventCreateState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
Then("after reload the event {string} sits at timeline index {int}", async ({ page }, name: string, index: number) => {
  await page.reload();
  const { dayId } = dayOrderState(page);
  const [row] = await eventsNamed(dayId, name);
  expect(row).toBeDefined();
  const order = await storedDayOrder(dayId);
  expect(order.findIndex((item) => item.type === "event" && item.id === row.id)).toBe(index);
});
When(
  "I create the event {string} with a client ID at position {int} through the day API",
  async ({ page }, name: string, position: number) => {
    const current = eventCreateState(page);
    current.clientId = randomUUID();
    current.retryBody = { id: current.clientId, name, insertAtPosition: position };
    const response = await postDayEvent(page, current.retryBody);
    expect(response.status()).toBe(200);
  }
);
When("I retry the client ID event creation", async ({ page }) => {
  await postDayEvent(page, eventCreateState(page).retryBody);
});
Then("the retried event keeps its shifted position and the day holds it once", async ({ page }) => {
  const { clientId, response } = eventCreateState(page);
  const { dayId, original } = dayOrderState(page);
  expect(response!.status()).toBe(200);
  // "Retry me" went in at 1, then "Shifter" at 1 pushed it to 2; the replay returns it as stored.
  expect(await response!.json()).toMatchObject({ id: clientId, name: "Retry me", dayId, position: 2 });
  const rows = await withE2EDb((database) =>
    database.select({ id: events.id, position: events.position }).from(events).where(eq(events.id, clientId!))
  );
  expect(rows).toEqual([{ id: clientId, position: 2 }]);
  expect(await storedDayOrder(dayId)).toHaveLength(original.length + 2);
});
When("I reuse the client ID for the event {string}", async ({ page }, name: string) => {
  await postDayEvent(page, { id: eventCreateState(page).clientId, name });
});
Then("the day holds the client ID event once", async ({ page }) => {
  const rows = await withE2EDb((database) =>
    database
      .select({ name: events.name })
      .from(events)
      .where(eq(events.id, eventCreateState(page).clientId!))
  );
  expect(rows).toEqual([{ name: "Retry me" }]);
});
When("I send the keyed event create {string} twice", async ({ page }, name: string) => {
  const current = eventCreateState(page);
  current.keyedBodies = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await postDayEvent(page, { name }, { key: state(page).key });
    expect(response.status()).toBe(200);
    current.keyedBodies.push(await response.json());
  }
});
Then("both keyed event creates return identical JSON naming {string}", async ({ page }, name: string) => {
  const [first, second] = eventCreateState(page).keyedBodies as { name: string }[];
  expect(second).toEqual(first);
  expect(first.name).toBe(name);
});
Then("the day holds {int} event(s) named {string}", async ({ page }, count: number, name: string) => {
  expect(await eventsNamed(dayOrderState(page).dayId, name)).toHaveLength(count);
});
When("I reuse the event create key with the name {string}", async ({ page }, name: string) => {
  await postDayEvent(page, { name }, { key: state(page).key });
});
When("I submit event create case {string}", async ({ page }, testCase: string) => {
  const unique = randomUUID();
  const bodies: Record<string, unknown> = {
    "blank-name": { name: "   " },
    "null-field": { name: "Valid", note: null },
    "unknown-key": { name: "Valid", position: 3 },
    "linked-event-id": { id: `linked-${unique}`, name: "Valid" },
    "linked-after-id": { name: "Valid", afterEventId: `linked-${unique}` },
    "negative-position": { name: "Valid", insertAtPosition: -1 },
  };
  await postDayEvent(
    page,
    bodies[testCase] ?? { name: "Valid" },
    testCase === "linked-day" ? { dayId: `linked-${unique}` } : {}
  );
});

// ── Event delete API ────────────────────────────────────────────────────────
type DeleteKind = "keep" | "discard" | "day-less";
interface DeleteFixture {
  eventId: string;
  documentId?: string;
  expenseId?: string;
  file?: string;
}
interface EventDeleteState {
  tripId: string;
  fixtures: Record<DeleteKind, DeleteFixture>;
  response?: APIResponse;
  responses: APIResponse[];
}
const eventDeleteStates = new WeakMap<Page, EventDeleteState>();
function eventDeleteState(page: Page): EventDeleteState {
  const value = eventDeleteStates.get(page);
  if (!value) throw new Error("Event delete API fixture missing");
  return value;
}
function deleteKind(kind: string): DeleteKind {
  if (kind !== "keep" && kind !== "discard" && kind !== "day-less") throw new Error(`Unknown delete kind "${kind}".`);
  return kind;
}
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
Given("scenario-owned events with documents for the event delete API", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  const storageRoot = resolve(E2E_STORAGE_DIRECTORY);
  await mkdir(storageRoot, { recursive: true });
  const unique = randomUUID();
  const fixtures = await withE2EDb(async (database) => {
    const [day] = await database
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 1)));
    async function withDocument(kind: "keep" | "discard", position: number): Promise<DeleteFixture> {
      const [event] = await database
        .insert(events)
        .values({ tripId, dayId: day.id, name: `API delete ${kind}`, position })
        .returning({ id: events.id });
      // A real event-document key, so the storage route can serve it while the event exists.
      const file = `event-documents/${event.id}/${unique}.pdf`;
      await mkdir(join(storageRoot, "event-documents", event.id), { recursive: true });
      await writeFile(join(storageRoot, file), kind);
      const [document] = await database
        .insert(documents)
        .values({
          tripId,
          eventId: event.id,
          name: `API ${kind} doc`,
          kind: "pdf",
          size: "1",
          url: `/api/storage/${file}`,
        })
        .returning({ id: documents.id });
      const fixture: DeleteFixture = { eventId: event.id, documentId: document.id, file };
      if (kind === "discard") {
        const [expense] = await database
          .insert(expenses)
          .values({
            tripId,
            eventId: event.id,
            category: "food",
            amount: "12.00",
            currency: "USD",
            convertedAmountProfile: "12.00",
            date: "2026-08-01",
          })
          .returning({ id: expenses.id });
        fixture.expenseId = expense.id;
      }
      return fixture;
    }
    const keep = await withDocument("keep", 20);
    const discard = await withDocument("discard", 21);
    const [dayLess] = await database
      .insert(events)
      .values({ tripId, dayId: null, name: "API delete floating", position: 0 })
      .returning({ id: events.id });
    return { keep, discard, "day-less": { eventId: dayLess.id } };
  });
  eventDeleteStates.set(page, { tripId, fixtures, responses: [] });
});
After(async ({ page }) => {
  const current = eventDeleteStates.get(page);
  if (!current) return;
  for (const fixture of Object.values(current.fixtures)) {
    if (fixture.file) await rm(join(resolve(E2E_STORAGE_DIRECTORY), fixture.file), { force: true });
  }
});
function deleteBody(current: EventDeleteState, kind: DeleteKind) {
  return kind === "keep" ? { tripId: current.tripId, keepDocuments: true } : { tripId: current.tripId };
}
async function sendEventDelete(page: Page, eventId: string, body: unknown, key?: string) {
  // A page request in flight when the Given cleared the cookies can set them again before this send; clear at the send.
  if (state(page).role === "anonymous") await page.context().clearCookies();
  const response = await page.request.delete(`/api/v1/events/${eventId}`, {
    headers: key ? { ...headers(page), "idempotency-key": key } : headers(page),
    data: body,
  });
  eventDeleteState(page).response = response;
  return response;
}
When("I delete the {string} event through the event delete API", async ({ page }, kind: string) => {
  const current = eventDeleteState(page);
  const target = deleteKind(kind);
  await sendEventDelete(page, current.fixtures[target].eventId, deleteBody(current, target));
});
When("I send the keyed {string} event delete twice", async ({ page }, kind: string) => {
  const current = eventDeleteState(page);
  const target = deleteKind(kind);
  current.responses = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    current.responses.push(
      await sendEventDelete(page, current.fixtures[target].eventId, deleteBody(current, target), state(page).key)
    );
  }
});
When("I submit event delete case {string}", async ({ page }, testCase: string) => {
  const { tripId, fixtures } = eventDeleteState(page);
  const eventId = fixtures.discard.eventId;
  const requests: Record<string, { eventId: string; body: unknown }> = {
    "missing-trip": { eventId, body: {} },
    "linked-id": { eventId: `linked-${randomUUID()}`, body: { tripId } },
    "non-boolean-keep": { eventId, body: { tripId, keepDocuments: "yes" } },
    "unknown-key": { eventId, body: { tripId, force: true } },
  };
  const request = requests[testCase];
  await sendEventDelete(page, request.eventId, request.body);
});
Then("the event delete API returns {int}", async ({ page }, status: number) => {
  const response = eventDeleteState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the event delete API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = eventDeleteState(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
Then("both keyed event deletes return 204", async ({ page }) => {
  const { responses } = eventDeleteState(page);
  expect(responses).toHaveLength(2);
  for (const response of responses) expect(response.status()).toBe(204);
});
async function expectEventCount(eventId: string, count: number) {
  const rows = await withE2EDb((database) =>
    database.select({ id: events.id }).from(events).where(eq(events.id, eventId))
  );
  expect(rows).toHaveLength(count);
}
async function expectDocument(fixture: DeleteFixture) {
  return withE2EDb((database) => database.select().from(documents).where(eq(documents.id, fixture.documentId!)));
}
Then(
  "after reload the {string} event is gone and its document is a trip document with its file kept",
  async ({ page }, kind: string) => {
    const current = eventDeleteState(page);
    const fixture = current.fixtures[deleteKind(kind)];
    await page.reload();
    await expectEventCount(fixture.eventId, 0);
    const [document] = await expectDocument(fixture);
    expect(document).toMatchObject({ eventId: null, tripId: current.tripId });
    expect(await fileExists(join(resolve(E2E_STORAGE_DIRECTORY), fixture.file!))).toBe(true);
    // The event is gone, but its kept document must still open for the trip's members.
    const file = await page.request.get(`/api/storage/${fixture.file}`);
    expect(file.status()).toBe(200);
    expect(await file.text()).toBe("keep");
  }
);
Then(
  "after reload the {string} event, its document and its expense are gone and its file is removed",
  async ({ page }, kind: string) => {
    const fixture = eventDeleteState(page).fixtures[deleteKind(kind)];
    await page.reload();
    await expectEventCount(fixture.eventId, 0);
    expect(await expectDocument(fixture)).toHaveLength(0);
    const expenseRows = await withE2EDb((database) =>
      database.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, fixture.expenseId!))
    );
    expect(expenseRows).toHaveLength(0);
    expect(await fileExists(join(resolve(E2E_STORAGE_DIRECTORY), fixture.file!))).toBe(false);
  }
);
Then("the {string} event is gone", async ({ page }, kind: string) => {
  await expectEventCount(eventDeleteState(page).fixtures[deleteKind(kind)].eventId, 0);
});
Then("the {string} event, its document and its file are untouched", async ({ page }, kind: string) => {
  const current = eventDeleteState(page);
  const fixture = current.fixtures[deleteKind(kind)];
  await expectEventCount(fixture.eventId, 1);
  expect(await expectDocument(fixture)).toMatchObject([{ eventId: fixture.eventId, tripId: current.tripId }]);
  expect(await fileExists(join(resolve(E2E_STORAGE_DIRECTORY), fixture.file!))).toBe(true);
});

// ── Queued file deletions ───────────────────────────────────────────────────
// Scoped to this scenario's own file URLs: other scenarios delete events in parallel and queue rows of their own.
const queuedFiles = new WeakMap<Page, string>();
async function queuedRowsFor(urls: string[]) {
  if (urls.length === 0) return [];
  return withE2EDb((database) =>
    database.select().from(pendingFileDeletions).where(inArray(pendingFileDeletions.url, urls))
  );
}
Then("no file deletion is left queued", async ({ page }) => {
  const files = Object.values(eventDeleteState(page).fixtures).flatMap((fixture) =>
    fixture.file ? [`/api/storage/${fixture.file}`] : []
  );
  expect(await queuedRowsFor(files)).toEqual([]);
});
Given("a stored file is left queued for deletion", async ({ page }) => {
  const storageRoot = resolve(E2E_STORAGE_DIRECTORY);
  const key = `event-documents/${randomUUID()}/${randomUUID()}.pdf`;
  await mkdir(dirname(join(storageRoot, key)), { recursive: true });
  await writeFile(join(storageRoot, key), "orphan");
  await withE2EDb((database) => database.insert(pendingFileDeletions).values({ url: `/api/storage/${key}` }));
  queuedFiles.set(page, key);
});
When("I open the app", async ({ page }) => {
  // Every app page schedules the maintenance pass; the E2E server runs it on each render.
  await page.goto("/trips");
});
Then("the queued file and its queue row are removed", async ({ page }) => {
  const key = queuedFiles.get(page)!;
  await expect.poll(() => fileExists(join(resolve(E2E_STORAGE_DIRECTORY), key)), { timeout: 15_000 }).toBe(false);
  await expect.poll(async () => (await queuedRowsFor([`/api/storage/${key}`])).length, { timeout: 15_000 }).toBe(0);
});
After(async ({ page }) => {
  const key = queuedFiles.get(page);
  if (!key) return;
  await rm(join(resolve(E2E_STORAGE_DIRECTORY), key), { force: true });
  await withE2EDb((database) =>
    database.delete(pendingFileDeletions).where(eq(pendingFileDeletions.url, `/api/storage/${key}`))
  );
});

// ── Day note API ────────────────────────────────────────────────────────────
interface NoteApiState {
  response?: APIResponse;
  responses: APIResponse[];
  clientId?: string;
  retryBody?: Record<string, unknown>;
  /** The existing note's row as stored just before the latest PATCH, to prove a repeat wrote nothing. */
  before?: { content: string; updatedAt: Date | null };
}
const noteApiStates = new WeakMap<Page, NoteApiState>();
function noteApi(page: Page): NoteApiState {
  let current = noteApiStates.get(page);
  if (!current) {
    current = { responses: [] };
    noteApiStates.set(page, current);
  }
  return current;
}
function existingNoteId(page: Page): string {
  const note = dayOrderState(page).original.find((item) => item.type === "note");
  if (!note) throw new Error("The mixed day holds no note.");
  return note.id;
}
async function sendNote(
  page: Page,
  method: "post" | "patch" | "delete",
  url: string,
  body: unknown,
  key?: string
): Promise<APIResponse> {
  // A page request in flight when the Given cleared the cookies can set them again before this send; clear at the send.
  if (state(page).role === "anonymous") await page.context().clearCookies();
  const response = await page.request[method](url, {
    headers: key ? { ...headers(page), "idempotency-key": key } : headers(page),
    data: body,
  });
  const current = noteApi(page);
  current.response = response;
  current.responses.push(response);
  return response;
}
function postDayNote(page: Page, body: unknown, options: { key?: string; dayId?: string } = {}) {
  return sendNote(page, "post", `/api/v1/days/${options.dayId ?? dayOrderState(page).dayId}/notes`, body, options.key);
}
function patchNote(page: Page, noteId: string, body: unknown, key?: string) {
  return sendNote(page, "patch", `/api/v1/itinerary-notes/${noteId}`, body, key);
}
function deleteNote(page: Page, noteId: string, body: unknown, key?: string) {
  return sendNote(page, "delete", `/api/v1/itinerary-notes/${noteId}`, body, key);
}
async function storedNote(noteId: string) {
  const [row] = await withE2EDb((database) =>
    database
      .select({ content: itineraryNotes.content, updatedAt: itineraryNotes.updatedAt, dayId: itineraryNotes.dayId })
      .from(itineraryNotes)
      .where(eq(itineraryNotes.id, noteId))
  );
  return row;
}
async function notesWithContent(dayId: string, content: string) {
  return withE2EDb((database) =>
    database
      .select({ id: itineraryNotes.id, position: itineraryNotes.position })
      .from(itineraryNotes)
      .where(and(eq(itineraryNotes.dayId, dayId), eq(itineraryNotes.content, content)))
  );
}
Then("the note API returns {int}", async ({ page }, status: number) => {
  const response = noteApi(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the note API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = noteApi(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
When(
  "I create the note {string} at position {int} through the day API",
  async ({ page }, content: string, position: number) => {
    await postDayNote(page, { content, insertAtPosition: position });
  }
);
When("I create the note {string} at the end through the day API", async ({ page }, content: string) => {
  await postDayNote(page, { content });
});
When("I create the note {string} on a day that no longer exists", async ({ page }, content: string) => {
  await postDayNote(page, { content }, { dayId: randomUUID() });
});
Then(
  "after reload the note {string} sits at timeline index {int}",
  async ({ page }, content: string, index: number) => {
    await page.reload();
    const { dayId } = dayOrderState(page);
    const [row] = await notesWithContent(dayId, content);
    expect(row).toBeDefined();
    const order = await storedDayOrder(dayId);
    expect(order.findIndex((item) => item.type === "note" && item.id === row.id)).toBe(index);
  }
);
Then("the original items keep their relative order", async ({ page }) => {
  const { dayId, original } = dayOrderState(page);
  const originalKeys = new Set(original.map((item) => `${item.type}:${item.id}`));
  const remaining = (await storedDayOrder(dayId)).filter((item) => originalKeys.has(`${item.type}:${item.id}`));
  expect(remaining).toEqual(original);
});
When(
  "I create the note {string} with a client ID at position {int} through the day API",
  async ({ page }, content: string, position: number) => {
    const current = noteApi(page);
    current.clientId = randomUUID();
    current.retryBody = { id: current.clientId, content, insertAtPosition: position };
    const response = await postDayNote(page, current.retryBody);
    expect(response.status()).toBe(200);
  }
);
When("I retry the client ID note creation", async ({ page }) => {
  await postDayNote(page, noteApi(page).retryBody);
});
Then("the retried note keeps its shifted position and the day holds it once", async ({ page }) => {
  const { clientId, response } = noteApi(page);
  const { dayId, original } = dayOrderState(page);
  expect(response!.status()).toBe(200);
  // "Retry me" went in at 1, then "Shifter" at 1 pushed it to 2; the replay returns it as stored.
  expect(await response!.json()).toMatchObject({ id: clientId, content: "Retry me", tripDayId: dayId, position: 2 });
  const rows = await withE2EDb((database) =>
    database
      .select({ id: itineraryNotes.id, position: itineraryNotes.position })
      .from(itineraryNotes)
      .where(eq(itineraryNotes.id, clientId!))
  );
  expect(rows).toEqual([{ id: clientId, position: 2 }]);
  expect(await storedDayOrder(dayId)).toHaveLength(original.length + 2);
});
When("I reuse the client ID for the note {string}", async ({ page }, content: string) => {
  await postDayNote(page, { id: noteApi(page).clientId, content });
});
Then("the day holds the client ID note once", async ({ page }) => {
  const rows = await withE2EDb((database) =>
    database
      .select({ content: itineraryNotes.content })
      .from(itineraryNotes)
      .where(eq(itineraryNotes.id, noteApi(page).clientId!))
  );
  expect(rows).toEqual([{ content: "Retry me" }]);
});
When("I send the keyed note create {string} twice", async ({ page }, content: string) => {
  noteApi(page).responses = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await postDayNote(page, { content }, { key: state(page).key });
    expect(response.status()).toBe(200);
  }
});
Then("both keyed note requests return identical JSON naming {string}", async ({ page }, content: string) => {
  const [first, second] = await Promise.all(noteApi(page).responses.map((response) => response.json()));
  expect(second).toEqual(first);
  expect(first.content).toBe(content);
});
Then("the day holds {int} note(s) with the content {string}", async ({ page }, count: number, content: string) => {
  expect(await notesWithContent(dayOrderState(page).dayId, content)).toHaveLength(count);
});
When("I reuse the note create key with the content {string}", async ({ page }, content: string) => {
  await postDayNote(page, { content }, { key: state(page).key });
});
When("I submit note create case {string}", async ({ page }, testCase: string) => {
  const unique = randomUUID();
  const bodies: Record<string, unknown> = {
    "missing-content": {},
    "over-long-content": { content: "x".repeat(5001) },
    "non-text-content": { content: 5 },
    "unknown-key": { content: "Valid", position: 3 },
    "linked-note-id": { id: `linked-${unique}`, content: "Valid" },
    "negative-position": { content: "Valid", insertAtPosition: -1 },
  };
  await postDayNote(
    page,
    bodies[testCase] ?? { content: "Valid" },
    testCase === "linked-day" ? { dayId: `linked-${unique}` } : {}
  );
});

When("I patch the existing note with {string}", async ({ page }, content: string) => {
  const noteId = existingNoteId(page);
  noteApi(page).before = await storedNote(noteId);
  await patchNote(page, noteId, { content });
});
When("I patch a note that does not exist", async ({ page }) => {
  await patchNote(page, randomUUID(), { content: "Ghost" });
});
When("I send the keyed note edit {string} twice", async ({ page }, content: string) => {
  noteApi(page).responses = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await patchNote(page, existingNoteId(page), { content }, state(page).key);
    expect(response.status()).toBe(200);
  }
});
When("I reuse the note edit key with the content {string}", async ({ page }, content: string) => {
  await patchNote(page, existingNoteId(page), { content }, state(page).key);
});
When("I submit note edit case {string}", async ({ page }, testCase: string) => {
  const noteId = existingNoteId(page);
  const requests: Record<string, { id: string; body: unknown }> = {
    "missing-content": { id: noteId, body: {} },
    "over-long-content": { id: noteId, body: { content: "x".repeat(5001) } },
    "unknown-key": { id: noteId, body: { content: "Valid", position: 0 } },
    "linked-id": { id: `linked-${randomUUID()}`, body: { content: "Valid" } },
  };
  const request = requests[testCase];
  await patchNote(page, request.id, request.body);
});
Then("after reload the existing note holds {string} in its original place", async ({ page }, content: string) => {
  await page.reload();
  expect((await storedNote(existingNoteId(page))).content).toBe(content);
  expect(await storedDayOrder(dayOrderState(page).dayId)).toEqual(dayOrderState(page).original);
});
Then("the existing note holds {string}", async ({ page }, content: string) => {
  expect((await storedNote(existingNoteId(page))).content).toBe(content);
});
Then("the existing note was not rewritten", async ({ page }) => {
  const before = noteApi(page).before!;
  const after = await storedNote(existingNoteId(page));
  expect(after.content).toBe(before.content);
  expect(after.updatedAt?.getTime()).toBe(before.updatedAt?.getTime());
});

When("I delete the existing note through the note API", async ({ page }) => {
  await deleteNote(page, existingNoteId(page), { tripId: dayOrderState(page).tripId });
});
When("I send the keyed note delete twice", async ({ page }) => {
  noteApi(page).responses = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await deleteNote(page, existingNoteId(page), { tripId: dayOrderState(page).tripId }, state(page).key);
  }
});
When("I submit note delete case {string}", async ({ page }, testCase: string) => {
  const noteId = existingNoteId(page);
  const tripId = dayOrderState(page).tripId;
  const requests: Record<string, { id: string; body: unknown }> = {
    "missing-trip": { id: noteId, body: {} },
    "linked-id": { id: `linked-${randomUUID()}`, body: { tripId } },
    "unknown-key": { id: noteId, body: { tripId, force: true } },
  };
  const request = requests[testCase];
  await deleteNote(page, request.id, request.body);
});
Then("both keyed note deletes return 204", async ({ page }) => {
  const { responses } = noteApi(page);
  expect(responses).toHaveLength(2);
  for (const response of responses) expect(response.status()).toBe(204);
});
Then("after reload the existing note is gone and the other items keep their order", async ({ page }) => {
  await page.reload();
  const noteId = existingNoteId(page);
  const { dayId, original } = dayOrderState(page);
  expect(await storedNote(noteId)).toBeUndefined();
  expect(await storedDayOrder(dayId)).toEqual(original.filter((item) => item.id !== noteId));
});
Then("the existing note is gone", async ({ page }) => {
  expect(await storedNote(existingNoteId(page))).toBeUndefined();
});
// ── Trip note API ───────────────────────────────────────────────────────────
interface TripNoteApiState {
  tripId: string;
  /** The seeded notes' ids in stored order, first to last. */
  original: string[];
  response?: APIResponse;
  responses: APIResponse[];
  clientId?: string;
  retryBody?: Record<string, unknown>;
  /** The first note's row as stored just before the latest PATCH, to prove a repeat wrote nothing. */
  before?: { title: string | null; body: string | null; updatedAt: Date | null };
}
const tripNoteStates = new WeakMap<Page, TripNoteApiState>();
function tripNoteApi(page: Page): TripNoteApiState {
  const value = tripNoteStates.get(page);
  if (!value) throw new Error("Trip note API fixture missing");
  return value;
}
async function storedTripNotes(tripId: string) {
  return withE2EDb((database) =>
    database
      .select({
        id: notes.id,
        title: notes.title,
        body: notes.body,
        position: notes.position,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(eq(notes.tripId, tripId))
      .orderBy(notes.position)
  );
}
async function storedTripNote(noteId: string) {
  const [row] = await withE2EDb((database) =>
    database
      .select({ id: notes.id, title: notes.title, body: notes.body, updatedAt: notes.updatedAt })
      .from(notes)
      .where(eq(notes.id, noteId))
  );
  return row;
}
async function sendTripNote(
  page: Page,
  method: "post" | "put" | "patch" | "delete",
  url: string,
  body: unknown,
  key?: string
): Promise<APIResponse> {
  // A page request in flight when the Given cleared the cookies can set them again before this send; clear at the send.
  if (state(page).role === "anonymous") await page.context().clearCookies();
  const response = await page.request[method](url, {
    headers: key ? { ...headers(page), "idempotency-key": key } : headers(page),
    data: body,
  });
  const current = tripNoteApi(page);
  current.response = response;
  current.responses.push(response);
  return response;
}
function postTripNote(page: Page, body: unknown, key?: string) {
  return sendTripNote(page, "post", `/api/v1/trips/${tripNoteApi(page).tripId}/notes`, body, key);
}
function putTripNoteOrder(page: Page, noteIds: string[], key?: string) {
  return sendTripNote(page, "put", `/api/v1/trips/${tripNoteApi(page).tripId}/notes/order`, { noteIds }, key);
}
function patchTripNote(page: Page, noteId: string, body: unknown, key?: string) {
  return sendTripNote(page, "patch", `/api/v1/notes/${noteId}`, body, key);
}
function deleteTripNote(page: Page, noteId: string, body: unknown, key?: string) {
  return sendTripNote(page, "delete", `/api/v1/notes/${noteId}`, body, key);
}
function tripNoteIdAt(page: Page, which: string): string {
  const id = tripNoteApi(page).original[["first", "second", "third"].indexOf(which)];
  if (!id) throw new Error(`The trip holds no ${which} note.`);
  return id;
}
Given("scenario-owned trip notes for the trip note API", async ({ page, scenario }) => {
  const tripId = scenario.currentTrip!.id;
  await withE2EDb((database) =>
    database.insert(notes).values([
      { tripId, title: "First note", body: "First body", position: 0 },
      { tripId, title: "Second note", position: 1 },
      { tripId, title: "Third note", position: 2 },
    ])
  );
  const original = (await storedTripNotes(tripId)).map((row) => row.id);
  expect(original).toHaveLength(3);
  tripNoteStates.set(page, { tripId, original, responses: [] });
});
Then("the trip note API returns {int}", async ({ page }, status: number) => {
  const response = tripNoteApi(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the trip note API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = tripNoteApi(page).response!;
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  if (code === "validation_failed") expect(body.error.fields).toBeDefined();
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
Then("the stored trip note titles are {string}", async ({ page }, titles: string) => {
  const rows = await storedTripNotes(tripNoteApi(page).tripId);
  expect(rows.map((row) => row.title)).toEqual(titles.split(", "));
});
Then("after reload the stored trip note titles are {string}", async ({ page }, titles: string) => {
  await page.reload();
  const rows = await storedTripNotes(tripNoteApi(page).tripId);
  expect(rows.map((row) => row.title)).toEqual(titles.split(", "));
});
Then("the stored trip note positions run from 0 without gaps", async ({ page }) => {
  const rows = await storedTripNotes(tripNoteApi(page).tripId);
  expect(rows.map((row) => row.position)).toEqual(rows.map((_row, index) => index));
});
Then("the stored trip notes keep their original order", async ({ page }) => {
  const { tripId, original } = tripNoteApi(page);
  expect((await storedTripNotes(tripId)).map((row) => row.id)).toEqual(original);
});

When("I create the trip note {string} through the trip note API", async ({ page }, title: string) => {
  await postTripNote(page, { title });
});
When("I create the trip note {string} with a client ID through the trip note API", async ({ page }, title: string) => {
  const current = tripNoteApi(page);
  current.clientId = randomUUID();
  current.retryBody = { id: current.clientId, title };
  expect((await postTripNote(page, current.retryBody)).status()).toBe(200);
});
When("I retry the client ID trip note creation", async ({ page }) => {
  await postTripNote(page, tripNoteApi(page).retryBody);
});
When("I reuse the client ID for the trip note {string}", async ({ page }, title: string) => {
  await postTripNote(page, { id: tripNoteApi(page).clientId, title });
});
Then("the retried trip note keeps its shifted position and the trip holds it once", async ({ page }) => {
  const { clientId, response, tripId } = tripNoteApi(page);
  expect(response!.status()).toBe(200);
  // "Retry me" went in at 0, then "Shifter" went in at 0 and pushed it to 1; the replay returns it as stored.
  expect(await response!.json()).toMatchObject({ id: clientId, tripId, title: "Retry me", position: 1 });
  const rows = (await storedTripNotes(tripId)).filter((row) => row.id === clientId);
  expect(rows).toHaveLength(1);
  expect(rows[0].position).toBe(1);
});
Then("the trip holds the client ID trip note once", async ({ page }) => {
  const row = await storedTripNote(tripNoteApi(page).clientId!);
  expect(row.title).toBe("Retry me");
});
When("I send the keyed trip note create {string} twice", async ({ page }, title: string) => {
  tripNoteApi(page).responses = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    expect((await postTripNote(page, { title }, state(page).key)).status()).toBe(200);
  }
});
Then("both keyed trip note requests return identical JSON titled {string}", async ({ page }, title: string) => {
  const [first, second] = await Promise.all(tripNoteApi(page).responses.map((response) => response.json()));
  expect(second).toEqual(first);
  expect(first.title).toBe(title);
});
Then("the trip holds {int} trip note(s) titled {string}", async ({ page }, count: number, title: string) => {
  const rows = await storedTripNotes(tripNoteApi(page).tripId);
  expect(rows.filter((row) => row.title === title)).toHaveLength(count);
});
When("I reuse the trip note create key with the title {string}", async ({ page }, title: string) => {
  await postTripNote(page, { title }, state(page).key);
});
When("I submit trip note create case {string}", async ({ page }, testCase: string) => {
  const unique = randomUUID();
  const bodies: Record<string, unknown> = {
    empty: {},
    "blank-both": { title: " ", body: "\n" },
    "null-title": { title: null, body: "Valid" },
    "over-long-title": { title: "x".repeat(201) },
    "over-long-body": { body: "x".repeat(10001) },
    "non-text-body": { body: 5 },
    "unknown-key": { title: "Valid", position: 3 },
    "linked-note-id": { id: `linked-${unique}`, title: "Valid" },
  };
  await postTripNote(page, bodies[testCase]);
});

When("I patch the {word} trip note with:", async ({ page }, which: string, body: string) => {
  const noteId = tripNoteIdAt(page, which);
  tripNoteApi(page).before = await storedTripNote(noteId);
  await patchTripNote(page, noteId, JSON.parse(body));
});
When("I patch a trip note that does not exist", async ({ page }) => {
  await patchTripNote(page, randomUUID(), { title: "Ghost" });
});
When("I send the keyed trip note edit {string} twice", async ({ page }, title: string) => {
  tripNoteApi(page).responses = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    expect((await patchTripNote(page, tripNoteIdAt(page, "first"), { title }, state(page).key)).status()).toBe(200);
  }
});
When("I reuse the trip note edit key with the title {string}", async ({ page }, title: string) => {
  await patchTripNote(page, tripNoteIdAt(page, "first"), { title }, state(page).key);
});
When("I submit trip note edit case {string}", async ({ page }, testCase: string) => {
  const noteId = tripNoteIdAt(page, "first");
  const requests: Record<string, { id: string; body: unknown }> = {
    empty: { id: noteId, body: {} },
    "over-long-title": { id: noteId, body: { title: "x".repeat(201) } },
    "unknown-key": { id: noteId, body: { title: "Valid", position: 0 } },
    "linked-id": { id: `linked-${randomUUID()}`, body: { title: "Valid" } },
  };
  const request = requests[testCase];
  await patchTripNote(page, request.id, request.body);
});
Then("the stored first trip note matches:", async ({ page }, expected: string) => {
  expect(await storedTripNote(tripNoteIdAt(page, "first"))).toMatchObject(JSON.parse(expected));
});
Then("the stored second trip note matches:", async ({ page }, expected: string) => {
  expect(await storedTripNote(tripNoteIdAt(page, "second"))).toMatchObject(JSON.parse(expected));
});
Then("the first trip note was not rewritten", async ({ page }) => {
  const before = tripNoteApi(page).before!;
  const after = await storedTripNote(tripNoteIdAt(page, "first"));
  expect(after.title).toBe(before.title);
  expect(after.body).toBe(before.body);
  expect(after.updatedAt?.getTime()).toBe(before.updatedAt?.getTime());
});

When("I delete the first trip note through the trip note API", async ({ page }) => {
  await deleteTripNote(page, tripNoteIdAt(page, "first"), { tripId: tripNoteApi(page).tripId });
});
When("I send the keyed trip note delete twice", async ({ page }) => {
  tripNoteApi(page).responses = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await deleteTripNote(page, tripNoteIdAt(page, "first"), { tripId: tripNoteApi(page).tripId }, state(page).key);
  }
});
When("I submit trip note delete case {string}", async ({ page }, testCase: string) => {
  const noteId = tripNoteIdAt(page, "first");
  const { tripId } = tripNoteApi(page);
  const requests: Record<string, { id: string; body: unknown }> = {
    "missing-trip": { id: noteId, body: {} },
    "linked-id": { id: `linked-${randomUUID()}`, body: { tripId } },
    "unknown-key": { id: noteId, body: { tripId, force: true } },
  };
  const request = requests[testCase];
  await deleteTripNote(page, request.id, request.body);
});
Then("both keyed trip note deletes return 204", async ({ page }) => {
  const { responses } = tripNoteApi(page);
  expect(responses).toHaveLength(2);
  for (const response of responses) expect(response.status()).toBe(204);
});
Then("the first trip note is gone and the others keep their order", async ({ page }) => {
  const { tripId, original } = tripNoteApi(page);
  expect(await storedTripNote(original[0])).toBeUndefined();
  expect((await storedTripNotes(tripId)).map((row) => row.id)).toEqual(original.slice(1));
});

When("I PUT the reversed trip note order", async ({ page }) => {
  await putTripNoteOrder(page, [...tripNoteApi(page).original].reverse());
});
When("I PUT the reversed trip note order with an Idempotency-Key", async ({ page }) => {
  await putTripNoteOrder(page, [...tripNoteApi(page).original].reverse(), state(page).key);
});
When("I PUT the stored trip note order", async ({ page }) => {
  await putTripNoteOrder(page, tripNoteApi(page).original);
});
When("I PUT the stored trip note order with an Idempotency-Key", async ({ page }) => {
  await putTripNoteOrder(page, tripNoteApi(page).original, state(page).key);
});
When("I PUT the trip note order case {string}", async ({ page }, testCase: string) => {
  const { original } = tripNoteApi(page);
  const cases: Record<string, string[]> = {
    "missing-note": original.slice(0, -1),
    "extra-note": [...original, randomUUID()],
    "foreign-note": [...original.slice(0, -1), randomUUID()],
  };
  await putTripNoteOrder(page, cases[testCase]);
});
When("I submit trip note order case {string}", async ({ page }, testCase: string) => {
  const { original, tripId } = tripNoteApi(page);
  const bodies: Record<string, unknown> = {
    duplicate: { noteIds: [...original, original[0]] },
    "linked-id": { noteIds: [`linked-${randomUUID()}`] },
    "unknown-key": { noteIds: original, extra: 1 },
    "too-many": { noteIds: Array.from({ length: 501 }, () => randomUUID()) },
    "no-list": {},
  };
  await sendTripNote(page, "put", `/api/v1/trips/${tripId}/notes/order`, bodies[testCase]);
});
When("another editor adds a trip note directly", async ({ page }) => {
  const { tripId } = tripNoteApi(page);
  await withE2EDb((database) => database.insert(notes).values({ tripId, title: "Added elsewhere", position: 3 }));
});
When("I retry the same keyed trip note order PUT", async ({ page }) => {
  await putTripNoteOrder(page, [...tripNoteApi(page).original].reverse(), state(page).key);
});
Then("both keyed trip note order requests return the same order", async ({ page }) => {
  const [first, second] = await Promise.all(tripNoteApi(page).responses.map((response) => response.json()));
  expect(second).toEqual(first);
  expect(first.noteIds).toEqual([...tripNoteApi(page).original].reverse());
});
