import { expect, type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { collaborators, invitations } from "../../../src/db/schema";
import { withE2EDb } from "../e2e-db";
import { apiClient } from "../anonymous-api";
import { Given, Then, When } from "../fixtures";

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

type InvitationKind = "pending" | "expired" | "retired" | "foreign";

interface InvitationDecisionState {
  invitationId: string;
  tripId: string;
  /** The account the invitation is addressed to: the signed-in user, or someone else for the foreign kind. */
  inviteeId: string;
  /** Unique per scenario so keyed requests never collide across parallel workers. */
  keyPrefix: string;
  response?: APIResponse;
}

const decisionStates = new WeakMap<Page, InvitationDecisionState>();

function decisionState(page: Page): InvitationDecisionState {
  const current = decisionStates.get(page);
  if (!current) throw new Error("Invitation decision API fixture missing");
  return current;
}

Given("a {string} invitation for the invitation decision API", async ({ page, scenario }, kind: string) => {
  const invitationKind = kind as InvitationKind;
  const signedIn = await scenario.ensureCurrentUser();
  const { user: inviter } = await scenario.materialize({ user: { setCurrent: false } });
  if (!inviter) throw new Error("Invitation decision fixture inviter missing");
  const { trip } = await scenario.materialize({ trip: { ownerId: inviter.id, setCurrent: false } });
  if (!trip) throw new Error("Invitation decision fixture trip missing");
  let invitee = signedIn;
  if (invitationKind === "foreign") {
    const { user: other } = await scenario.materialize({ user: { setCurrent: false } });
    if (!other) throw new Error("Invitation decision fixture stranger missing");
    invitee = other;
  }
  const [row] = await withE2EDb((database) =>
    database
      .insert(invitations)
      .values({
        tripId: trip.id,
        inviteeId: invitee.id,
        invitedBy: inviter.id,
        role: "editor",
        status: invitationKind === "retired" ? "rescinded" : "pending",
        expiresAt: new Date(Date.now() + (invitationKind === "expired" ? -INVITE_TTL_MS : INVITE_TTL_MS)),
      })
      .returning({ id: invitations.id })
  );
  decisionStates.set(page, {
    invitationId: row.id,
    tripId: trip.id,
    inviteeId: invitee.id,
    keyPrefix: `decision-${randomUUID()}`,
  });
});

Given("the invitee already has a creator manager membership", async ({ page }) => {
  const current = decisionState(page);
  await withE2EDb((database) =>
    database.insert(collaborators).values({
      tripId: current.tripId,
      userId: current.inviteeId,
      name: "Existing",
      initials: "EX",
      role: "manager",
      isCreator: true,
    })
  );
});

Then("the invitee remains a creator manager after acceptance", async ({ page }) => {
  const current = decisionState(page);
  const rows = await withE2EDb((database) =>
    database
      .select({ role: collaborators.role, isCreator: collaborators.isCreator })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, current.tripId), eq(collaborators.userId, current.inviteeId)))
  );
  expect(rows).toEqual([{ role: "manager", isCreator: true }]);
});

When("I send the invitation decision {string} with {string} key", async ({ page }, decision: string, key: string) => {
  const current = decisionState(page);
  const client = await apiClient(page);
  current.response = await client.post(`/api/v1/invitations/${current.invitationId}/${decision}`, {
    headers: {
      "x-arrivo-client": "web",
      "content-type": "application/json",
      origin: new URL(page.url()).origin,
      ...(key === "none" ? {} : { "Idempotency-Key": `${current.keyPrefix}-${key}` }),
    },
    data: {},
  });
});

Then("the invitation decision API returns 200 with {string}", async ({ page }, status: string) => {
  const current = decisionState(page);
  expect(current.response!.status()).toBe(200);
  expect(current.response!.headers()["cache-control"]).toBe("no-store");
  expect(await current.response!.json()).toEqual(
    status === "accepted" ? { status, tripId: current.tripId } : { status }
  );
});

Then("the invitation decision API rejects with {int} and {string}", async ({ page }, status: number, code: string) => {
  const current = decisionState(page);
  expect(current.response!.status()).toBe(status);
  expect((await current.response!.json()).error.code).toBe(code);
});

Then("the invitation decision API message is {string}", async ({ page }, message: string) => {
  expect((await decisionState(page).response!.json()).error.message).toBe(message);
});

Then(
  "the invitation is {string} with {int} membership rows for its invitee",
  async ({ page }, status: string, memberships: number) => {
    const current = decisionState(page);
    const [stored, seats] = await withE2EDb(async (database) =>
      Promise.all([
        database
          .select({ status: invitations.status })
          .from(invitations)
          .where(eq(invitations.id, current.invitationId)),
        database
          .select({ id: collaborators.id, role: collaborators.role })
          .from(collaborators)
          .where(and(eq(collaborators.tripId, current.tripId), eq(collaborators.userId, current.inviteeId))),
      ])
    );
    expect(stored[0].status).toBe(status);
    expect(seats).toHaveLength(memberships);
    if (memberships > 0) expect(seats[0].role).toBe("editor");
  }
);
