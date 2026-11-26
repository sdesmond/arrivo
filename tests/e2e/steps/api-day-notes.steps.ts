import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { itineraryNotes } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";
import { reloadPage } from "../page-reload";
import { dayOrderState, existingNoteId, headers, state, storedDayOrder } from "../api-support";

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
async function sendNote(
  page: Page,
  method: "post" | "patch" | "delete",
  url: string,
  body: unknown,
  key?: string
): Promise<APIResponse> {
  const client = await apiClient(page);
  const response = await client[method](url, {
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
    await reloadPage(page);
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
  await reloadPage(page);
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
  await reloadPage(page);
  const noteId = existingNoteId(page);
  const { dayId, original } = dayOrderState(page);
  expect(await storedNote(noteId)).toBeUndefined();
  expect(await storedDayOrder(dayId)).toEqual(original.filter((item) => item.id !== noteId));
});
Then("the existing note is gone", async ({ page }) => {
  expect(await storedNote(existingNoteId(page))).toBeUndefined();
});
