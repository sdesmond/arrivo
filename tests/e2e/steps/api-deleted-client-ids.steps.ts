import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { checklistItems, days, events, itineraryChecklists, itineraryNotes, notes } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { When, Then } from "../fixtures";

/** A client-id create and its delete, for one resource the deletion records cover. */
interface ClientIdResource {
  create: (context: ResourceContext, id: string) => { url: string; body: Record<string, unknown> };
  deleteUrl: (id: string) => string;
  /** Rows stored under the id, so a refused retry can be shown to store nothing. */
  count: (id: string) => Promise<number>;
}

interface ResourceContext {
  tripId: string;
  dayId: string;
  checklistId: string;
}

interface DeletedClientIdState {
  context: ResourceContext;
  resource: ClientIdResource;
  clientId: string;
  response?: APIResponse;
}

const deletedClientIdStates = new WeakMap<Page, DeletedClientIdState>();

function countRows(read: (id: string) => Promise<unknown[]>) {
  return async (id: string) => (await read(id)).length;
}

const RESOURCES: Record<string, ClientIdResource> = {
  event: {
    create: ({ dayId }, id) => ({ url: `/api/v1/days/${dayId}/events`, body: { id, name: "Deleted retry event" } }),
    deleteUrl: (id) => `/api/v1/events/${id}`,
    count: countRows((id) =>
      withE2EDb((database) => database.select({ id: events.id }).from(events).where(eq(events.id, id)))
    ),
  },
  "day note": {
    create: ({ dayId }, id) => ({ url: `/api/v1/days/${dayId}/notes`, body: { id, content: "Deleted retry note" } }),
    deleteUrl: (id) => `/api/v1/itinerary-notes/${id}`,
    count: countRows((id) =>
      withE2EDb((database) =>
        database.select({ id: itineraryNotes.id }).from(itineraryNotes).where(eq(itineraryNotes.id, id))
      )
    ),
  },
  "trip note": {
    create: ({ tripId }, id) => ({ url: `/api/v1/trips/${tripId}/notes`, body: { id, title: "Deleted retry note" } }),
    deleteUrl: (id) => `/api/v1/notes/${id}`,
    count: countRows((id) =>
      withE2EDb((database) => database.select({ id: notes.id }).from(notes).where(eq(notes.id, id)))
    ),
  },
  checklist: {
    create: ({ tripId, dayId }, id) => ({
      url: `/api/v1/trips/${tripId}/checklists`,
      body: { id, dayId, position: 0 },
    }),
    deleteUrl: (id) => `/api/v1/checklists/${id}`,
    count: countRows((id) =>
      withE2EDb((database) =>
        database.select({ id: itineraryChecklists.id }).from(itineraryChecklists).where(eq(itineraryChecklists.id, id))
      )
    ),
  },
  "checklist item": {
    create: ({ checklistId }, id) => ({
      url: `/api/v1/checklists/${checklistId}/items`,
      body: { id, content: "Deleted retry item" },
    }),
    deleteUrl: (id) => `/api/v1/checklist-items/${id}`,
    count: countRows((id) =>
      withE2EDb((database) =>
        database.select({ id: checklistItems.id }).from(checklistItems).where(eq(checklistItems.id, id))
      )
    ),
  },
  day: {
    create: ({ tripId }, id) => ({ url: `/api/v1/trips/${tripId}/days`, body: { id } }),
    deleteUrl: (id) => `/api/v1/days/${id}`,
    count: countRows((id) =>
      withE2EDb((database) => database.select({ id: days.id }).from(days).where(eq(days.id, id)))
    ),
  },
};

function requestHeaders(page: Page) {
  return { "x-arrivo-client": "web", "content-type": "application/json", origin: new URL(page.url()).origin };
}

function deletedClientIdState(page: Page): DeletedClientIdState {
  const current = deletedClientIdStates.get(page);
  if (!current) throw new Error("No client-id resource was created in this scenario.");
  return current;
}

async function postCreate(page: Page, current: DeletedClientIdState, id: string): Promise<APIResponse> {
  const { url, body } = current.resource.create(current.context, id);
  const response = await (await apiClient(page)).post(url, { headers: requestHeaders(page), data: body });
  current.response = response;
  return response;
}

When("I create a {string} with a client id through the API", async ({ page, scenario }, resourceName: string) => {
  const resource = RESOURCES[resourceName];
  if (!resource) throw new Error(`Unknown client-id resource "${resourceName}".`);
  const tripId = scenario.currentTrip!.id;
  const context = await withE2EDb(async (database) => {
    const [firstDay] = await database
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 1)));
    const [checklist] = await database
      .select({ id: itineraryChecklists.id })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, firstDay.id));
    return { tripId, dayId: firstDay.id, checklistId: checklist.id };
  });
  const current: DeletedClientIdState = { context, resource, clientId: randomUUID() };
  deletedClientIdStates.set(page, current);
  const response = await postCreate(page, current, current.clientId);
  expect(response.status()).toBe(200);
  expect(await current.resource.count(current.clientId)).toBe(1);
});

When("I delete that resource through the API", async ({ page }) => {
  const current = deletedClientIdState(page);
  const response = await (
    await apiClient(page)
  ).delete(current.resource.deleteUrl(current.clientId), {
    headers: requestHeaders(page),
    data: { tripId: current.context.tripId },
  });
  expect(response.status()).toBe(204);
  expect(await current.resource.count(current.clientId)).toBe(0);
});

When("I retry the create with the same client id", async ({ page }) => {
  const current = deletedClientIdState(page);
  await postCreate(page, current, current.clientId);
});

When("I send the create again with a new client id", async ({ page }) => {
  const current = deletedClientIdState(page);
  current.clientId = randomUUID();
  await postCreate(page, current, current.clientId);
});

Then("the client-id create returns 409 with code {string} and stores nothing", async ({ page }, code: string) => {
  const current = deletedClientIdState(page);
  expect(current.response!.status()).toBe(409);
  expect((await current.response!.json()).error.code).toBe(code);
  expect(await current.resource.count(current.clientId)).toBe(0);
});

Then("the client-id create returns 200 and stores it once", async ({ page }) => {
  const current = deletedClientIdState(page);
  expect(current.response!.status()).toBe(200);
  expect(await current.resource.count(current.clientId)).toBe(1);
});
