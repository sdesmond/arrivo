import { expect, type APIResponse, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { notes } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";
import { reloadPage } from "../page-reload";
import { headers, state, storedTripNotes, tripNoteApi, tripNoteStates } from "../api-support";

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
  const client = await apiClient(page);
  const response = await client[method](url, {
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
  expect(
    response.status(),
    `Trip note API response URL: ${response.url()}, body: ${(await response.text()).slice(0, 200)}`
  ).toBe(status);
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
  await reloadPage(page);
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
