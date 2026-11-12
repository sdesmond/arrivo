import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { documents, collaborators } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { Given, When, Then, After } from "../fixtures";

interface DocumentApiState {
  tripId: string;
  /** The client document id the scenario's uploads share. */
  id: string;
  responses: APIResponse[];
  hiddenName?: string;
}
const documentApiStates = new WeakMap<Page, DocumentApiState>();
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
async function postDocument(
  page: Page,
  scenarioTripId: string,
  multipart: Record<string, string | ReturnType<typeof pdfPart>>,
  headers: Record<string, string> = {}
): Promise<APIResponse> {
  const current = documentApi(page, scenarioTripId);
  const response = await page.request.post(`/api/v1/trips/${current.tripId}/documents`, {
    headers: uploadHeaders(page, headers),
    multipart,
    timeout: 60_000,
  });
  current.responses.push(response);
  return response;
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
      const response = await page.request.post(`/api/v1/trips/${tripId}/documents`, {
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
