import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { trips, collaborators, pendingFileDeletions } from "../../../src/db/schema";
import { deriveGraphicCover } from "../../../src/lib/utils";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then, After } from "../fixtures";
interface CoverState {
  tripId: string;
  key: string;
  original: string;
  file?: string;
  response?: APIResponse;
}
const states = new WeakMap<Page, CoverState>();
const MEBIBYTE = 1024 * 1024;
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  "base64"
);
const GIF_BYTES = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const selection = {
  coverImageUrl: "https://images.unsplash.com/cover-api",
  coverPhotographer: "API Photographer",
  coverPhotographerUrl: "https://unsplash.com/@api",
};
function state(page: Page) {
  const current = states.get(page);
  if (!current) throw new Error("Cover fixture missing");
  return current;
}
function headers(page: Page) {
  return { "x-arrivo-client": "web", origin: new URL(page.url()).origin };
}
async function send(page: Page, method: "PUT" | "DELETE", data: unknown, extra: Record<string, string> = {}) {
  const current = state(page);
  const response = await page.request.fetch(`/api/v1/trips/${current.tripId}/cover`, {
    method,
    headers: { ...headers(page), ...extra },
    data,
  });
  current.response = response;
  return response;
}
function coverPart(name: string, buffer: Buffer, mimeType: string) {
  return { name, mimeType, buffer };
}
async function upload(
  page: Page,
  multipart: Record<string, string | ReturnType<typeof coverPart>>,
  extra: Record<string, string> = {}
) {
  const current = state(page);
  // No content-type: Playwright sets the multipart boundary itself.
  const response = await page.request.post(`/api/v1/trips/${current.tripId}/cover/image`, {
    headers: { ...headers(page), ...extra },
    multipart,
    timeout: 60_000,
  });
  current.response = response;
  return response;
}
async function storedCoverFiles(page: Page): Promise<string[]> {
  try {
    return await readdir(join(resolve(E2E_STORAGE_DIRECTORY), "trip-covers", state(page).tripId));
  } catch {
    return [];
  }
}
async function cover(page: Page) {
  const [row] = await withE2EDb((database) =>
    database
      .select({
        name: trips.name,
        coverImageUrl: trips.coverImageUrl,
        coverPhotographer: trips.coverPhotographer,
        coverPhotographerUrl: trips.coverPhotographerUrl,
      })
      .from(trips)
      .where(eq(trips.id, state(page).tripId))
  );
  return row;
}
Given("a scenario-owned trip for the cover API", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip("threeDayTrip");
  await scenario.gotoCurrentTrip(page);
  const original = deriveGraphicCover(trip.name);
  await withE2EDb((database) =>
    database
      .update(trips)
      .set({ coverImageUrl: original, coverPhotographer: null, coverPhotographerUrl: null })
      .where(eq(trips.id, trip.id))
  );
  states.set(page, { tripId: trip.id, key: randomUUID(), original });
});
Given("my cover API role is {string}", async ({ page, scenario }, role: string) => {
  const current = state(page);
  await withE2EDb(async (database) => {
    const match = and(eq(collaborators.tripId, current.tripId), eq(collaborators.userId, scenario.currentUser!.id));
    if (role === "stranger") await database.delete(collaborators).where(match);
    else await database.update(collaborators).set({ role }).where(match);
  });
});
When("I select an attributed cover through the API", async ({ page }) => {
  expect((await send(page, "PUT", selection)).status()).toBe(204);
});
Then("the attributed API cover persists", async ({ page }) => {
  expect(await cover(page)).toMatchObject(selection);
});
When("I remove the cover through the API", async ({ page }) => {
  expect((await send(page, "DELETE", {})).status()).toBe(204);
});
Then("the API cover is a graphic without attribution", async ({ page }) => {
  const row = await cover(page);
  expect(row).toMatchObject({
    coverImageUrl: deriveGraphicCover(row.name),
    coverPhotographer: null,
    coverPhotographerUrl: null,
  });
});
When("I submit cover API case {string}", async ({ page }, testCase: string) => {
  const bodies: Record<string, unknown> = {
    "unsafe-image": { coverImageUrl: "javascript:alert(1)" },
    "unsafe-photographer": { ...selection, coverPhotographerUrl: "javascript:alert(1)" },
    "foreign-storage": { coverImageUrl: `/api/storage/trip-covers/${randomUUID()}/cover.png` },
    "unknown-field": { ...selection, extra: true },
    "delete-field": { extra: true },
  };
  await send(
    page,
    testCase === "delete-field" ? "DELETE" : "PUT",
    bodies[testCase] ?? selection,
    testCase === "cross-site" ? { origin: "https://other.example", "sec-fetch-site": "cross-site" } : {}
  );
});
Then("the cover API returns {int} without changing the cover", async ({ page }, status: number) => {
  expect(state(page).response!.status()).toBe(status);
  expect((await cover(page)).coverImageUrl).toBe(state(page).original);
});
When("I replay keyed cover writes after later changes", async ({ page }) => {
  const key = state(page).key;
  expect((await send(page, "PUT", selection, { "idempotency-key": key })).status()).toBe(204);
  expect((await send(page, "DELETE", {})).status()).toBe(204);
  expect((await send(page, "PUT", selection, { "idempotency-key": key })).status()).toBe(204);
  expect((await cover(page)).coverImageUrl).toBe(state(page).original);
  expect(
    (await send(page, "PUT", { coverImageUrl: "https://example.com/other" }, { "idempotency-key": key })).status()
  ).toBe(409);
  const removeKey = randomUUID();
  expect((await send(page, "DELETE", {}, { "idempotency-key": removeKey })).status()).toBe(204);
  expect((await send(page, "PUT", selection)).status()).toBe(204);
  expect((await send(page, "DELETE", {}, { "idempotency-key": removeKey })).status()).toBe(204);
  expect(await cover(page)).toMatchObject(selection);
});
Given("a stored map cover owned by the cover API trip", async ({ page }) => {
  const current = state(page);
  const directory = join(resolve(E2E_STORAGE_DIRECTORY), "trip-covers", current.tripId);
  await mkdir(directory, { recursive: true });
  current.file = join(directory, "map.png");
  await writeFile(
    current.file,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
      "base64"
    )
  );
  current.original = `/api/storage/trip-covers/${current.tripId}/map.png`;
  await withE2EDb((database) =>
    database.update(trips).set({ coverImageUrl: current.original }).where(eq(trips.id, current.tripId))
  );
});
Then("the replaced stored cover file is removed after commit", async ({ page }) => {
  await expect
    .poll(async () => {
      try {
        await access(state(page).file!);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);
  const queued = await withE2EDb((database) =>
    database
      .select()
      .from(pendingFileDeletions)
      .where(eq(pendingFileDeletions.url, state(page).original))
  );
  expect(queued).toHaveLength(0);
});
When("I force the cover cleanup transaction to roll back", async ({ page }) => {
  await withCleanupRollback(page, () => send(page, "DELETE", {}));
});
When("I force the cover cleanup transaction to roll back during an upload", async ({ page }) => {
  await withCleanupRollback(page, () => upload(page, { file: coverPart("rollback.png", PNG_BYTES, "image/png") }));
});
async function withCleanupRollback(page: Page, action: () => Promise<unknown>) {
  const current = state(page);
  const identifier = "cover_rollback_" + randomUUID().replaceAll("-", "");
  await withE2EDb(async (database) => {
    await database.execute(
      sql`CREATE FUNCTION ${sql.identifier(identifier)}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'scenario cover rollback'; END; $$`
    );
    try {
      await database.execute(
        sql`CREATE TRIGGER ${sql.identifier(identifier)} BEFORE INSERT ON pending_file_deletions FOR EACH ROW WHEN (NEW.url = ${sql.raw("'" + current.original + "'")}) EXECUTE FUNCTION ${sql.identifier(identifier)}()`
      );
      await action();
    } finally {
      await database.execute(sql`DROP TRIGGER IF EXISTS ${sql.identifier(identifier)} ON pending_file_deletions`);
      await database.execute(sql`DROP FUNCTION ${sql.identifier(identifier)}()`);
    }
  });
}
Then("the rolled-back cover file and row remain", async ({ page }) => {
  expect(state(page).response!.status()).toBe(500);
  expect((await cover(page)).coverImageUrl).toBe(state(page).original);
  await access(state(page).file!);
  expect(
    await withE2EDb((database) =>
      database
        .select()
        .from(pendingFileDeletions)
        .where(eq(pendingFileDeletions.url, state(page).original))
    )
  ).toHaveLength(0);
});
When("I upload a {string} cover through the API", async ({ page }, kind: string) => {
  const parts: Record<string, ReturnType<typeof coverPart>> = {
    PNG: coverPart("cover.png", PNG_BYTES, "image/png"),
    GIF: coverPart("cover.gif", GIF_BYTES, "image/gif"),
  };
  if (!parts[kind]) throw new Error(`Unknown cover upload kind ${kind}`);
  expect((await upload(page, { file: parts[kind] })).status()).toBe(204);
});
When("I submit cover upload API case {string}", async ({ page }, testCase: string) => {
  const valid = coverPart("cover.png", PNG_BYTES, "image/png");
  const filler = (bytes: number) => Buffer.concat([PNG_BYTES, Buffer.alloc(bytes - PNG_BYTES.length)]);
  const cases: Record<string, () => Promise<APIResponse>> = {
    valid: () => upload(page, { file: valid }),
    // Just over the cover limit: the route reads the body and the service rejects it.
    "oversize-file": () => upload(page, { file: coverPart("big.png", filler(12 * MEBIBYTE + 1), "image/png") }),
    // Far over: the route refuses from Content-Length before reading the body.
    "oversize-body": () => upload(page, { file: coverPart("huge.png", filler(14 * MEBIBYTE), "image/png") }),
    "disallowed-type": () => upload(page, { file: coverPart("c.svg", Buffer.from("<svg/>"), "image/svg+xml") }),
    "mismatched-type": () =>
      upload(page, { file: coverPart("fake.png", Buffer.from("<html><script>1</script></html>"), "image/png") }),
    "missing-file": () => upload(page, { note: "no file" }),
    "unknown-field": () => upload(page, { note: "x", file: valid }),
    keyed: () => upload(page, { file: valid }, { "idempotency-key": "cover-upload-key" }),
    "no-client-header": async () => {
      const current = state(page);
      current.response = await page.request.post(`/api/v1/trips/${current.tripId}/cover/image`, {
        headers: { origin: new URL(page.url()).origin },
        multipart: { file: valid },
      });
      return current.response;
    },
    "cross-origin": () =>
      upload(page, { file: valid }, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
  };
  const send = cases[testCase];
  if (!send) throw new Error(`Unknown cover upload case ${testCase}`);
  await send();
});
Then("the API cover is a stored upload without attribution", async ({ page }) => {
  const row = await cover(page);
  const prefix = `/api/storage/trip-covers/${state(page).tripId}/`;
  expect(row.coverImageUrl!.startsWith(prefix)).toBe(true);
  expect(row.coverImageUrl).toMatch(/\.(png|gif)$/);
  expect(row).toMatchObject({ coverPhotographer: null, coverPhotographerUrl: null });
  const stored = await readFile(join(resolve(E2E_STORAGE_DIRECTORY), row.coverImageUrl!.slice("/api/storage/".length)));
  expect(stored.length).toBeGreaterThan(0);
});
Then("the cover upload stored no new file", async ({ page }) => {
  expect(await storedCoverFiles(page)).toHaveLength(state(page).file ? 1 : 0);
});
Then("the cover upload API returns {int} with code {string}", async ({ page }, status: number, code: string) => {
  const response = state(page).response!;
  expect(response.status()).toBe(status);
  expect((await response.json()).error.code).toBe(code);
});
Then("the rolled-back cover upload left no new file", async ({ page }) => {
  expect(state(page).response!.status()).toBe(500);
  expect(await storedCoverFiles(page)).toEqual(["map.png"]);
});
After(async ({ page }) => {
  const current = states.get(page);
  if (current) {
    await rm(join(resolve(E2E_STORAGE_DIRECTORY), "trip-covers", current.tripId), { recursive: true, force: true });
  }
  states.delete(page);
});
