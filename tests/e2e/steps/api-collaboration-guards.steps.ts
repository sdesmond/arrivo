import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { collaborators, idempotencyKeys, invitations } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient, markAnonymousApiRole } from "../anonymous-api";
import { Given, Then, When } from "../fixtures";

type Operation =
  | "collaborators"
  | "invitable"
  | "invite"
  | "batch"
  | "accept"
  | "decline"
  | "resend"
  | "rescind"
  | "dismiss"
  | "leave";

interface GuardsState {
  tripId: string;
  invitationId: string;
  inviteeId: string;
  inviteeUsername: string;
  /** Unique per scenario so keyed requests never collide across parallel workers. */
  key: string;
  before?: Awaited<ReturnType<typeof snapshot>>;
  response?: APIResponse;
}

const states = new WeakMap<Page, GuardsState>();

function state(page: Page): GuardsState {
  const current = states.get(page);
  if (!current) throw new Error("Collaboration guards fixture missing");
  return current;
}

async function snapshot(current: GuardsState) {
  return withE2EDb(async (database) => ({
    invitations: await database
      .select()
      .from(invitations)
      .where(eq(invitations.tripId, current.tripId))
      .orderBy(invitations.id),
    collaborators: await database
      .select()
      .from(collaborators)
      .where(eq(collaborators.tripId, current.tripId))
      .orderBy(collaborators.id),
    replays: await database
      .select()
      .from(idempotencyKeys)
      .where(sql`${idempotencyKeys.key} like ${`%${current.key}%`}`),
  }));
}

function request(current: GuardsState, operation: Operation) {
  const { tripId, invitationId } = current;
  switch (operation) {
    case "collaborators":
      return { method: "GET", path: `/api/v1/trips/${tripId}/collaborators`, data: undefined };
    case "invitable":
      return { method: "GET", path: `/api/v1/users/invitable?tripId=${tripId}`, data: undefined };
    case "invite":
      return {
        method: "POST",
        path: `/api/v1/trips/${tripId}/invitations`,
        data: { id: randomUUID(), username: current.inviteeUsername, role: "editor" },
      };
    case "batch":
      return {
        method: "PATCH",
        path: `/api/v1/trips/${tripId}/collaborators`,
        data: { changes: [{ type: "remove", collaboratorId: randomUUID() }] },
      };
    case "accept":
    case "decline":
      return { method: "POST", path: `/api/v1/invitations/${invitationId}/${operation}`, data: {} };
    case "resend":
    case "dismiss":
      return { method: "POST", path: `/api/v1/invitations/${invitationId}/${operation}`, data: { tripId } };
    case "rescind":
      return { method: "DELETE", path: `/api/v1/trips/${tripId}/invitations/${invitationId}`, data: {} };
    case "leave":
      return { method: "DELETE", path: `/api/v1/trips/${tripId}/collaborators/me`, data: {} };
  }
}

async function send(page: Page, operation: Operation, origin?: string): Promise<APIResponse> {
  const current = state(page);
  const { method, path, data } = request(current, operation);
  const headers: Record<string, string> = {
    "x-arrivo-client": "web",
    "content-type": "application/json",
    origin: origin ?? new URL(page.url()).origin,
  };
  if (method !== "GET") headers["Idempotency-Key"] = current.key;
  const client = await apiClient(page);
  current.response = await client.fetch(path, { method, headers, ...(data === undefined ? {} : { data }) });
  return current.response;
}

Given("a {string} invitation for the collaboration guards API", async ({ page, scenario }, kind: string) => {
  const actor = await scenario.ensureCurrentUser();
  const trip = await scenario.ensureCurrentTrip();
  const { user } = await scenario.materialize({ user: { setCurrent: false } });
  if (!user) throw new Error("Collaboration guards invitee missing");
  const [row] = await withE2EDb((database) =>
    database
      .insert(invitations)
      .values({
        tripId: trip.id,
        inviteeId: user.id,
        invitedBy: actor.id,
        role: "viewer",
        status: kind,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      })
      .returning({ id: invitations.id })
  );
  states.set(page, {
    tripId: trip.id,
    invitationId: row.id,
    inviteeId: user.id,
    inviteeUsername: user.username,
    key: `guards-${randomUUID()}`,
  });
});

Given("my collaboration guards role is {string}", async ({ page, scenario }, role: string) => {
  if (role === "anonymous") {
    await markAnonymousApiRole(page);
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

When("I call the collaboration guards {string} route", async ({ page }, operation: string) => {
  const current = state(page);
  current.before = await snapshot(current);
  await send(page, operation as Operation);
});

When(
  "I call the collaboration guards {string} route from origin {string}",
  async ({ page }, operation: string, origin: string) => {
    const current = state(page);
    current.before = await snapshot(current);
    await send(page, operation as Operation, origin);
  }
);

When("I send the keyed collaboration guards {string} request", async ({ page }, operation: string) => {
  const response = await send(page, operation as Operation);
  expect(response.status()).toBe(200);
  const current = state(page);
  current.before = await snapshot(current);
  expect(current.before.replays.length).toBeGreaterThan(0);
});

When("I replay the exact collaboration guards {string} request", async ({ page }, operation: string) => {
  // Baseline after the access change, so only what the denied retry itself would alter is compared.
  const current = state(page);
  current.before = await snapshot(current);
  await send(page, operation as Operation);
});

Then("the collaboration guards API returns {int} and {string}", async ({ page }, status: number, code: string) => {
  const { response } = state(page);
  expect(response!.status()).toBe(status);
  expect((await response!.json()).error.code).toBe(code);
});

Then("the collaboration guards state is unchanged", async ({ page }) => {
  const current = state(page);
  expect(await snapshot(current)).toEqual(current.before);
});
