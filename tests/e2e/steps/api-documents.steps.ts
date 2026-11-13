import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { documents, collaborators, events, reservations, pendingFileDeletions } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { Given, When, Then, After } from "../fixtures";

import { E2E_EVENT, E2E_RESERVATION } from "../e2e-seed-data";

interface DocumentApiState {
  /** Fixture attachment stays fixed even when a request probes another target. */
  readonly scope?: "event" | "reservation";
  readonly targetId?: string;
  tripId: string;
  /** The client document id the scenario's uploads share. */
  id: string;
  responses: APIResponse[];
  hiddenName?: string;
  uploadedUrl?: string;
  requestedTargets?: { scope: "event" | "reservation"; id: string }[];
}
const documentApiStates = new WeakMap<Page, DocumentApiState>();

When("I force the scenario document delete transaction to roll back", async ({ page }) => {
  const current = documentApi(page);
  const identifier = "document_rollback_" + randomUUID().replaceAll("-", "");
  await withE2EDb(async (database) => {
    await database.execute(
      sql`CREATE FUNCTION ${sql.identifier(identifier)}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'scenario document rollback'; END; $$`
    );
    try {
      // Only this scenario's fresh document can hit the trigger; parallel scenarios keep working.
      await database.execute(
        sql`CREATE TRIGGER ${sql.identifier(identifier)} BEFORE DELETE ON documents FOR EACH ROW WHEN (OLD.id = ${sql.raw("'" + current.id + "'::uuid")}) EXECUTE FUNCTION ${sql.identifier(identifier)}()`
      );
      current.responses.push(
        await page.request.delete("/api/v1/documents/" + current.id, {
          headers: uploadHeaders(page),
          data: { tripId: current.tripId },
        })
      );
    } finally {
      await database.execute(sql`DROP TRIGGER IF EXISTS ${sql.identifier(identifier)} ON documents`);
      await database.execute(sql`DROP FUNCTION ${sql.identifier(identifier)}()`);
    }
  });
});

Then("the rolled-back document has no queued file deletion", async ({ page }) => {
  const current = documentApi(page);
  expect(
    await withE2EDb((database) =>
      database.select().from(pendingFileDeletions).where(eq(pendingFileDeletions.url, current.uploadedUrl!))
    )
  ).toHaveLength(0);
});
const PDF_BYTES = Buffer.from("%PDF-1.4 e2e document upload");
const MEBIBYTE = 1024 * 1024;

function documentApi(page: Page, tripId?: string): DocumentApiState {
  let current = documentApiStates.get(page);
  if (!current) {
    if (!tripId) throw new Error("Document API fixture missing");
    current = { tripId, id: randomUUID(), responses: [] };
    documentApiStates.set(page, current);
  }
  return current;
}
function lastResponse(page: Page): APIResponse {
  const response = documentApi(page).responses.at(-1);
  if (!response) throw new Error("No document API response yet");
  return response;
}
function uploadHeaders(page: Page, extra: Record<string, string> = {}) {
  // No content-type: Playwright sets the multipart boundary itself.
  return { "x-arrivo-client": "web", origin: new URL(page.url()).origin, ...extra };
}
function pdfPart(name: string, buffer: Buffer = PDF_BYTES, mimeType = "application/pdf") {
  return { name, mimeType, buffer };
}
function uploadPath(current: DocumentApiState): string {
  return current.scope
    ? `/api/v1/${current.scope}s/${current.targetId}/documents`
    : `/api/v1/trips/${current.tripId}/documents`;
}
async function postDocument(
  page: Page,
  scenarioTripId: string,
  multipart: Record<string, string | ReturnType<typeof pdfPart>>,
  headers: Record<string, string> = {},
  target?: { scope: "event" | "reservation"; id: string }
): Promise<APIResponse> {
  const current = documentApi(page, scenarioTripId);
  if (target) (current.requestedTargets ??= []).push(target);
  const path = target ? `/api/v1/${target.scope}s/${target.id}/documents` : uploadPath(current);
  const response = await page.request.post(path, {
    headers: uploadHeaders(page, headers),
    multipart,
    timeout: 60_000,
  });
  current.responses.push(response);
  return response;
}
function scopedTargets(current: DocumentApiState) {
  const targets = current.scope
    ? [{ scope: current.scope, id: current.targetId! }, ...(current.requestedTargets ?? [])]
    : [];
  return [...new Map(targets.map((target) => [`${target.scope}:${target.id}`, target])).values()];
}
function targetDirectory(target: { scope: "event" | "reservation"; id: string }): string {
  return join(resolve(E2E_STORAGE_DIRECTORY), `${target.scope}-documents`, target.id);
}
async function storedTripDocuments(tripId: string) {
  return withE2EDb((database) =>
    database
      .select({ id: documents.id, name: documents.name, kind: documents.kind, url: documents.url })
      .from(documents)
      .where(and(eq(documents.tripId, tripId), isNull(documents.eventId), isNull(documents.reservationId)))
  );
}
async function uploadedFileCount(tripId: string): Promise<number> {
  try {
    return (await readdir(join(resolve(E2E_STORAGE_DIRECTORY), "trip-documents", tripId))).length;
  } catch {
    return 0;
  }
}

After(async ({ page }) => {
  const current = documentApiStates.get(page);
  if (!current) return;
  documentApiStates.delete(page);
  for (const target of scopedTargets(current)) await rm(targetDirectory(target), { recursive: true, force: true });
  await rm(join(resolve(E2E_STORAGE_DIRECTORY), "trip-documents", current.tripId), { recursive: true, force: true });
});

When("I upload {string} as a PDF through the document API", async ({ page, scenario }, name: string) => {
  await postDocument(page, scenario.currentTrip!.id, { file: pdfPart(name) });
});
When(
  "I upload {string} as a PDF with the scenario document id through the document API",
  async ({ page, scenario }, name: string) => {
    const { id } = documentApi(page, scenario.currentTrip!.id);
    await postDocument(page, scenario.currentTrip!.id, { id, file: pdfPart(name) });
  }
);
When("I submit document upload case {string}", async ({ page, scenario }, testCase: string) => {
  const tripId = scenario.currentTrip!.id;
  const filler = (bytes: number) => Buffer.concat([PDF_BYTES, Buffer.alloc(bytes - PDF_BYTES.length, 0x20)]);
  const cases: Record<string, () => Promise<APIResponse>> = {
    "invalid-target": () => {
      return postDocument(
        page,
        tripId,
        { file: pdfPart("a.pdf") },
        {},
        { scope: documentApi(page).scope!, id: "linked-event" }
      );
    },
    "missing-target": () => {
      return postDocument(
        page,
        tripId,
        { file: pdfPart("a.pdf") },
        {},
        { scope: documentApi(page).scope!, id: randomUUID() }
      );
    },
    // Just over the document limit: the route reads the body and the service rejects it.
    "oversize-file": () => postDocument(page, tripId, { file: pdfPart("big.pdf", filler(25 * MEBIBYTE + 1)) }),
    // Far over: the route refuses from Content-Length before reading the body.
    "oversize-body": () => postDocument(page, tripId, { file: pdfPart("huge.pdf", filler(27 * MEBIBYTE)) }),
    "disallowed-type": () =>
      postDocument(page, tripId, { file: pdfPart("notes.docx", Buffer.from("word"), "application/msword") }),
    "mismatched-type": () =>
      postDocument(page, tripId, { file: pdfPart("fake.pdf", Buffer.from("<html><script>1</script></html>")) }),
    "missing-file": () => postDocument(page, tripId, { id: randomUUID() }),
    "bad-id": () => postDocument(page, tripId, { id: "not-a-uuid", file: pdfPart("a.pdf") }),
    "unknown-field": () => postDocument(page, tripId, { name: "x", file: pdfPart("a.pdf") }),
    keyed: () => postDocument(page, tripId, { file: pdfPart("a.pdf") }, { "idempotency-key": "document-upload-key" }),
    "no-client-header": async () => {
      const current = documentApi(page, tripId);
      const response = await page.request.post(uploadPath(current), {
        headers: { origin: new URL(page.url()).origin },
        multipart: { file: pdfPart("a.pdf") },
      });
      current.responses.push(response);
      return response;
    },
    "cross-origin": () =>
      postDocument(
        page,
        tripId,
        { file: pdfPart("a.pdf") },
        { origin: "https://evil.example", "sec-fetch-site": "cross-site" }
      ),
  };
  const send = cases[testCase];
  if (!send) throw new Error(`Unknown document upload case ${testCase}`);
  await send();
});
Given("a document with the scenario document id exists in a trip I cannot see", async ({ page, scenario }) => {
  const current = documentApi(page, scenario.currentTrip!.id);
  const { trip: otherTrip } = await scenario.materialize({ trip: { mother: "threeDayTrip", setCurrent: false } });
  const userId = scenario.currentUser!.id;
  current.hiddenName = `Hidden ${randomUUID()}.pdf`;
  await withE2EDb(async (database) => {
    await database
      .delete(collaborators)
      .where(and(eq(collaborators.tripId, otherTrip!.id), eq(collaborators.userId, userId)));
    await database.insert(documents).values({
      id: current.id,
      tripId: otherTrip!.id,
      name: current.hiddenName!,
      kind: "pdf",
      size: "0.0 KB",
      url: "/api/storage/trip-documents/hidden.pdf",
    });
  });
});

Then("the document API returns {int}", async ({ page }, status: number) => {
  const response = lastResponse(page);
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
});
Then("the document API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = lastResponse(page);
  expect(response.status()).toBe(status);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect((await response.json()).error.code).toBe(code);
});
Then("the uploaded document is a PDF trip document named {string}", async ({ page }, name: string) => {
  const body = await lastResponse(page).json();
  expect(body).toMatchObject({ name, kind: "pdf", scope: "trip" });
  const rows = await storedTripDocuments(documentApi(page).tripId);
  expect(rows).toEqual([expect.objectContaining({ id: body.id, name, kind: "pdf" })]);
});
Then("both document API uploads return the same stored document", async ({ page }) => {
  const [first, second] = documentApi(page).responses;
  expect(first.status()).toBe(200);
  expect(second.status()).toBe(200);
  const firstBody = await first.json();
  const secondBody = await second.json();
  expect(secondBody.id).toBe(documentApi(page).id);
  expect(secondBody).toEqual(firstBody);
});
Then("the trip stores {int} trip document(s)", async ({ page }, count: number) => {
  expect(await storedTripDocuments(documentApi(page).tripId)).toHaveLength(count);
});
Then("the trip holds {int} uploaded file(s)", async ({ page }, count: number) => {
  expect(await uploadedFileCount(documentApi(page).tripId)).toBe(count);
});
Then("the response does not reveal the hidden document", async ({ page }) => {
  const current = documentApi(page);
  expect(await lastResponse(page).text()).not.toContain(current.hiddenName);
  expect(await storedTripDocuments(current.tripId)).toHaveLength(0);
});
Then("after reload the Documents tab lists {string}", async ({ page }, name: string) => {
  await page.reload();
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
});

Given("a scenario-owned {string} document API target", async ({ page, scenario }, scope: string) => {
  if (scope !== "event" && scope !== "reservation") throw new Error("Unknown document scope");
  const { trip } = await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: {
        events: [
          { ...E2E_EVENT, dayNumber: 1 },
          { ...E2E_EVENT, name: "Second document API event", dayNumber: 1, position: 1 },
        ],
        reservations: [E2E_RESERVATION, { ...E2E_RESERVATION, provider: "Second document API reservation" }],
      },
      setCurrent: true,
    },
  });
  const targetId = await withE2EDb(async (database) => {
    if (scope === "event") {
      const [row] = await database
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.tripId, trip!.id), eq(events.name, E2E_EVENT.name)));
      return row.id;
    }
    const [row] = await database
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.tripId, trip!.id), eq(reservations.provider, E2E_RESERVATION.provider)));
    return row.id;
  });
  documentApiStates.set(page, { tripId: trip!.id, id: randomUUID(), responses: [], scope, targetId });
  await scenario.gotoCurrentTrip(page);
});
Then(
  "the scoped document API stores {int} document(s) and {int} file(s)",
  async ({ page }, count: number, fileCount: number) => {
    const current = documentApi(page);
    const rows = await withE2EDb((database) =>
      database.select().from(documents).where(eq(documents.tripId, current.tripId))
    );
    expect(rows).toHaveLength(count);
    for (const row of rows) expect(row[current.scope === "event" ? "eventId" : "reservationId"]).toBe(current.targetId);
    for (const target of scopedTargets(current)) {
      let files: string[] = [];
      try {
        files = await readdir(targetDirectory(target));
      } catch {
        /* No upload directory exists for refused writes. */
      }
      const isOriginal = target.scope === current.scope && target.id === current.targetId;
      expect(files, `files retained for ${target.scope}:${target.id}`).toHaveLength(isOriginal ? fileCount : 0);
    }
    for (const row of rows) {
      expect(row.id).toBe(current.id);
      expect(row.name).toBe("scoped.pdf");
      expect(row.url).toBe((await current.responses[0].json()).url);
      expect(row[current.scope === "event" ? "reservationId" : "eventId"]).toBeNull();
      expect(await readFile(join(resolve(E2E_STORAGE_DIRECTORY), row.url!.replace(/^\/api\/storage\//, "")))).toEqual(
        PDF_BYTES
      );
    }
  }
);
Then("the returned document belongs to its intended scope", async ({ page }) => {
  const current = documentApi(page);
  expect(await lastResponse(page).json()).toMatchObject({ scope: current.scope, name: "scoped.pdf", kind: "pdf" });
});

When("I concurrently retry the scoped document upload", async ({ page }) => {
  const current = documentApi(page);
  await Promise.all(
    Array.from({ length: 4 }, () => postDocument(page, current.tripId, { id: current.id, file: pdfPart("scoped.pdf") }))
  );
});
Then("every concurrent document upload returns the same stored document", async ({ page }) => {
  const current = documentApi(page);
  expect(current.responses).toHaveLength(4);
  const first = await current.responses[0].json();
  for (const response of current.responses) {
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(first);
  }
  expect(first).toMatchObject({ id: current.id, scope: current.scope, name: "scoped.pdf" });
});
When("I reuse the document id on a different {string}", async ({ page }, change: string) => {
  const current = documentApi(page);
  if (!current.scope || (change !== "target" && change !== "scope")) throw new Error("Unknown document target change");
  const scope = change === "target" ? current.scope : current.scope === "event" ? "reservation" : "event";
  const targetId = await withE2EDb(async (database) => {
    if (scope === "event") {
      const name = change === "target" ? "Second document API event" : E2E_EVENT.name;
      const [row] = await database
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.tripId, current.tripId), eq(events.name, name)));
      return row.id;
    }
    const provider = change === "target" ? "Second document API reservation" : E2E_RESERVATION.provider;
    const [row] = await database
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.tripId, current.tripId), eq(reservations.provider, provider)));
    return row.id;
  });
  await postDocument(
    page,
    current.tripId,
    { id: current.id, file: pdfPart("scoped.pdf") },
    {},
    { scope, id: targetId }
  );
});

Given("a scenario-owned {string} document ready for mutation", async ({ page, scenario }, scope: string) => {
  if (!["trip", "event", "reservation"].includes(scope)) throw new Error("Unknown document scope");
  const { trip } = await scenario.materialize({
    trip: {
      mother: "threeDayTrip",
      overrides: { events: [{ ...E2E_EVENT, dayNumber: 1 }], reservations: [E2E_RESERVATION] },
      setCurrent: true,
    },
  });
  const targetId =
    scope === "trip"
      ? undefined
      : await withE2EDb(async (database) => {
          const [row] = await database
            .select({ id: scope === "event" ? events.id : reservations.id })
            .from(scope === "event" ? events : reservations)
            .where(eq(scope === "event" ? events.tripId : reservations.tripId, trip!.id));
          return row.id;
        });
  const current: DocumentApiState = {
    tripId: trip!.id,
    id: randomUUID(),
    responses: [],
    ...(scope === "trip" ? {} : { scope: scope as "event" | "reservation", targetId }),
  };
  documentApiStates.set(page, current);
  await scenario.gotoCurrentTrip(page);
  const response = await postDocument(page, current.tripId, { id: current.id, file: pdfPart("original.pdf") });
  expect(response.status()).toBe(200);
  current.uploadedUrl = (await response.json()).url;
});
When("I submit document mutation {string} case {string}", async ({ page }, method: string, testCase: string) => {
  const current = documentApi(page);
  let documentId = current.id;
  let body: Record<string, unknown> = method === "PATCH" ? { name: "Renamed.pdf" } : { tripId: current.tripId };
  let headers: Record<string, string> = { ...uploadHeaders(page), "content-type": "application/json" };
  if (testCase === "keyed") headers["idempotency-key"] = method + "-" + current.id;
  else if (testCase === "blank") body = { name: " " };
  else if (testCase === "long") body = { name: "x".repeat(201) };
  else if (testCase === "empty") body = {};
  else if (testCase === "scope-field") body = { eventId: randomUUID() };
  else if (testCase === "unknown") documentId = randomUUID();
  else if (testCase === "foreign-trip") body = { tripId: randomUUID() };
  else if (testCase === "no-client-header")
    headers = { origin: new URL(page.url()).origin, "content-type": "application/json" };
  else if (testCase === "cross-origin")
    headers = { ...headers, origin: "https://evil.example", "sec-fetch-site": "cross-site" };
  else if (testCase !== "normal") throw new Error("Unknown document mutation case");
  current.responses.push(await page.request.fetch("/api/v1/documents/" + documentId, { method, headers, data: body }));
});
When("the document name is changed behind the API to {string}", async ({ page }, name: string) => {
  const current = documentApi(page);
  await withE2EDb((database) => database.update(documents).set({ name }).where(eq(documents.id, current.id)));
});
Then("the document mutation persisted name {string}", async ({ page }, name: string) => {
  const current = documentApi(page);
  const [row] = await withE2EDb((database) => database.select().from(documents).where(eq(documents.id, current.id)));
  expect(row.name).toBe(name);
  expect(
    await readFile(join(resolve(E2E_STORAGE_DIRECTORY), current.uploadedUrl!.replace(/^\/api\/storage\//, "")))
  ).toEqual(PDF_BYTES);
});
Then("the document mutation removed its row and file", async ({ page }) => {
  const current = documentApi(page);
  expect(
    await withE2EDb((database) => database.select().from(documents).where(eq(documents.id, current.id)))
  ).toHaveLength(0);
  await expect
    .poll(async () => {
      try {
        await readFile(join(resolve(E2E_STORAGE_DIRECTORY), current.uploadedUrl!.replace(/^\/api\/storage\//, "")));
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);
});
Then("the last two document mutation responses match", async ({ page }) => {
  const responses = documentApi(page).responses.slice(-2);
  expect(responses[0].status()).toBe(responses[1].status());
  if (responses[0].status() === 204) expect(await responses[1].text()).toBe("");
  else expect(await responses[0].json()).toEqual(await responses[1].json());
});
