import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { days, documents, events, expenses, pendingFileDeletions } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { apiClient } from "../anonymous-api";
import { Given, When, Then, After } from "../fixtures";
import { reloadPage } from "../page-reload";
import { fileExists, headers, state } from "../api-support";

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
  const client = await apiClient(page);
  const response = await client.delete(`/api/v1/events/${eventId}`, {
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
    await reloadPage(page);
    await expectEventCount(fixture.eventId, 0);
    const [document] = await expectDocument(fixture);
    expect(document).toMatchObject({ eventId: null, tripId: current.tripId });
    expect(await fileExists(join(resolve(E2E_STORAGE_DIRECTORY), fixture.file!))).toBe(true);
    // The event is gone, but its kept document must still open for the trip's members.
    const file = await (await apiClient(page)).get(`/api/storage/${fixture.file}`);
    expect(file.status()).toBe(200);
    expect(await file.text()).toBe("keep");
  }
);
Then(
  "after reload the {string} event, its document and its expense are gone and its file is removed",
  async ({ page }, kind: string) => {
    const fixture = eventDeleteState(page).fixtures[deleteKind(kind)];
    await reloadPage(page);
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
