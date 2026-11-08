import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import {
  checklistItems,
  itineraryChecklists,
  days,
  collaborators,
  idempotencyKeys,
  users,
} from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
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
    checklists: [
      {
        dayNumber: 1,
        position: 0,
        title: "API packing",
        items: [{ text: "API passport", position: 0, isChecked: false }],
      },
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
  states.set(page, { itemId, key: `e2e-${unique}`, suffix: unique.replaceAll("-", ""), responses: [] });
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
