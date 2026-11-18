import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { collaborators, invitations } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, When, Then } from "../fixtures";

interface LifecycleState {
  tripId: string;
  invitationId: string;
  key: string;
  response?: APIResponse;
  saved?: unknown;
  requestStartedAt?: number;
}
const states = new WeakMap<Page, LifecycleState>();
function state(page: Page): LifecycleState {
  const result = states.get(page);
  if (!result) throw new Error("Lifecycle fixture missing");
  return result;
}
Given("a {string} invitation for the manager lifecycle API", async ({ page, scenario }, kind: string) => {
  const actor = await scenario.ensureCurrentUser();
  const trip = await scenario.ensureCurrentTrip();
  const { user } = await scenario.materialize({ user: { setCurrent: false } });
  if (!user) throw new Error("Invitee missing");
  let invitationTrip = trip.id;
  if (kind === "foreign") {
    const { trip: other } = await scenario.materialize({ trip: { ownerId: actor.id, setCurrent: false } });
    if (!other) throw new Error("Other trip missing");
    invitationTrip = other.id;
  }
  const [row] = await withE2EDb((database) =>
    database
      .insert(invitations)
      .values({
        tripId: invitationTrip,
        inviteeId: user.id,
        invitedBy: actor.id,
        role: "viewer",
        status: kind === "declined" ? "declined" : "pending",
        expiresAt: new Date(Date.now() + (kind === "expired" ? -1 : 1) * 72 * 60 * 60 * 1000),
      })
      .returning({ id: invitations.id })
  );
  if (kind === "editor")
    await withE2EDb((database) =>
      database
        .update(collaborators)
        .set({ role: "editor" })
        .where(and(eq(collaborators.tripId, trip.id), eq(collaborators.userId, actor.id)))
    );
  states.set(page, { tripId: trip.id, invitationId: row.id, key: randomUUID() });
});
When("I send the manager lifecycle {string} request", async ({ page }, operation: string) => {
  const current = state(page);
  const client = await apiClient(page);
  const headers = {
    "x-arrivo-client": "web",
    "content-type": "application/json",
    origin: new URL(page.url()).origin,
    "Idempotency-Key": current.key,
  };
  const path =
    operation === "rescind"
      ? `/api/v1/trips/${current.tripId}/invitations/${current.invitationId}`
      : `/api/v1/invitations/${current.invitationId}/${operation}`;
  current.requestStartedAt = Date.now();
  current.response =
    operation === "rescind"
      ? await client.delete(path, { headers, data: {} })
      : await client.post(path, { headers, data: { tripId: current.tripId } });
});
Then("the manager lifecycle API returns {int} and {string}", async ({ page }, status: number, code: string) => {
  const current = state(page);
  expect(current.response!.status()).toBe(status);
  const body = await current.response!.json();
  if (status === 200) {
    expect(body.status).toBe("success");
    if (body.expiresAt) expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 71 * 60 * 60 * 1000);
    if (current.saved) expect(body).toEqual(current.saved);
    current.saved = body;
  } else expect(body.error.code).toBe(code);
});
Then("the manager lifecycle invitation is {string}", async ({ page }, status: string) => {
  const current = state(page);
  const [row] = await withE2EDb((database) =>
    database.select().from(invitations).where(eq(invitations.id, current.invitationId))
  );
  if (status === "deleted") expect(row).toBeUndefined();
  else {
    expect(row?.status).toBe(status);
    const response = current.saved as { expiresAt?: string } | undefined;
    if (response?.expiresAt) {
      expect(row!.expiresAt.toISOString()).toBe(response.expiresAt);
      const expectedExpiry = current.requestStartedAt! + 72 * 60 * 60 * 1000;
      expect(Math.abs(row!.expiresAt.getTime() - expectedExpiry)).toBeLessThan(60_000);
    }
  }
});
