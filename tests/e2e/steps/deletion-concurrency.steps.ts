import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import postgres from "postgres";
import { activityEvents, collaborators, invitations, trips, users } from "../../../src/db/schema";
import {
  AccountDeletionFailure,
  CollaboratorRole,
  TripDeletionAction,
  UserRole,
  type DeleteOwnAccountResult,
  type TripDeletionChoice,
} from "../../../src/data/types";
import { deleteOwnAccount } from "../../../src/lib/account-deletion";
import type { AccountDeletionDatabase } from "../../../src/lib/account-deletion";
import { ContributorChangeGuardError, createTripWrite } from "../../../src/lib/membership-writes";
import { After, Given, When, Then } from "../fixtures";
import {
  createDeletionConcurrencyFixture,
  type DeletionConcurrencyFixture,
  type GatedDatabaseOptions,
} from "../deletion-concurrency-fixture";
import { createLockGate } from "../role-service-fixture";
import type { ScenarioFixtureContext } from "../scenario-fixture";
import { withE2EDb } from "../e2e-db";
import { holdHttpRaceLock } from "../deletion-http-fixture";

const FIXTURE_KEY = "deletionConcurrencyFixture";
const CHOICES_KEY = "deletionConcurrencyChoices";
const OUTCOMES_KEY = "deletionConcurrencyOutcomes";
const HTTP_RACE_KEY = "deletionHttpAcceptanceRace";
const HTTP_MEMBER_KEY = "deletionHttpMemberRace";

interface HttpMemberRace {
  tripId: string;
  ownerId: string;
  managerId: string;
  managerSessionVersion: number;
  heirId: string;
  seatId: string;
  sessionVersion: number;
  operation: string;
  first?: string;
  responseStatus?: number;
  deletion?: DeleteOwnAccountResult;
  responseMessage?: string;
}

Given("an HTTP {string} race with a chosen heir", async ({ page, scenario }, operation: string) => {
  if (operation !== "removal" && operation !== "leave" && operation !== "role")
    throw new Error(`Unknown operation: ${operation}`);
  const owner = await scenario.ensureCurrentUser();
  const trip = await scenario.ensureCurrentTrip();
  const { user: heir } = await scenario.materialize({ user: { setCurrent: false } });
  const { user: manager } = await scenario.materialize({ user: { setCurrent: false } });
  if (!heir || !manager) throw new Error("Missing race accounts.");
  const { seatId, sessionVersion, managerSessionVersion } = await withE2EDb(async (database) => {
    const [seat] = await database
      .insert(collaborators)
      .values({
        tripId: trip.id,
        userId: heir.id,
        name: heir.name,
        initials: heir.initials,
        role: "editor",
        isCreator: false,
      })
      .returning({ id: collaborators.id });
    await database.insert(collaborators).values({
      tripId: trip.id,
      userId: manager.id,
      name: manager.name,
      initials: manager.initials,
      role: "manager",
      isCreator: false,
    });
    const [account] = await database
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, owner.id));
    const [managerAccount] = await database
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, manager.id));
    return {
      seatId: seat.id,
      sessionVersion: account.sessionVersion,
      managerSessionVersion: managerAccount.sessionVersion,
    };
  });
  scenario.setValue<HttpMemberRace>(HTTP_MEMBER_KEY, {
    tripId: trip.id,
    ownerId: owner.id,
    managerId: manager.id,
    managerSessionVersion,
    heirId: heir.id,
    seatId,
    sessionVersion,
    operation,
  });
  await scenario.signInAsUser(page, operation === "leave" ? heir.username : manager.username);
});

When(
  "the HTTP membership operation races owner deletion with {string} queued first",
  async ({ page, scenario }, first: string) => {
    const state = scenario.getValue<HttpMemberRace>(HTTP_MEMBER_KEY)!;
    if (first !== "operation" && first !== "deletion") throw new Error(`Unknown race ordering: ${first}`);
    const gate = await holdHttpRaceLock(
      first === "operation" ? "collaborators" : "trips",
      first === "operation" ? state.seatId : state.tripId
    );
    const headers = { "x-arrivo-client": "web", origin: new URL(page.url()).origin };
    const change = () =>
      state.operation === "leave"
        ? page.request.delete(`/api/v1/trips/${state.tripId}/collaborators/me`, { headers, data: {} })
        : page.request.patch(`/api/v1/trips/${state.tripId}/collaborators`, {
            headers,
            data: {
              changes: [
                state.operation === "role"
                  ? { type: "role", collaboratorId: state.seatId, fromRole: "editor", toRole: "viewer" }
                  : { type: "remove", collaboratorId: state.seatId },
              ],
            },
          });
    const deleteAccount = () =>
      withE2EDb((database) =>
        deleteOwnAccount(
          database as unknown as AccountDeletionDatabase,
          state.ownerId,
          [{ tripId: state.tripId, action: TripDeletionAction.Transfer, newOwnerUserId: state.heirId }],
          state.sessionVersion
        )
      );
    let operation: ReturnType<typeof change> | undefined;
    let deletion: ReturnType<typeof deleteAccount> | undefined;
    try {
      if (first === "operation") operation = change();
      else deletion = deleteAccount();
      const firstPid = await gate.waitForBlockedBy(gate.pid);
      if (first === "operation") deletion = deleteAccount();
      else operation = change();
      await gate.waitForBlockedBy(firstPid, "trips");
      await gate.release();
      const [response, outcome] = await Promise.all([operation!, deletion!]);
      state.first = first;
      state.responseStatus = response.status();
      if (!response.ok()) state.responseMessage = (await response.json()).error.message;
      state.deletion = outcome;
    } finally {
      await gate.close();
      await Promise.allSettled([...(operation ? [operation] : []), ...(deletion ? [deletion] : [])]);
    }
  }
);

Then("the HTTP membership race respects the transfer decision", async ({ scenario }) => {
  const state = scenario.getValue<HttpMemberRace>(HTTP_MEMBER_KEY)!;
  if (state.first === "operation") {
    expect(state.responseStatus).toBe(state.operation === "leave" ? 204 : 200);
    if (state.operation === "role") expect(state.deletion).toMatchObject({ ok: true });
    else expect(state.deletion).toEqual({ ok: false, reason: AccountDeletionFailure.Stale });
  } else {
    expect(state.responseStatus).toBe(422);
    expect(state.deletion).toMatchObject({ ok: true });
    expect(state.responseMessage).toBe(
      state.operation === "leave"
        ? "The trip creator can't leave this trip."
        : "The trip creator's seat cannot be changed."
    );
  }
  const [trip] = await withE2EDb((database) =>
    database.select({ ownerId: trips.ownerId }).from(trips).where(eq(trips.id, state.tripId))
  );
  expect(trip.ownerId).toBe(state.first === "operation" && state.operation !== "role" ? state.ownerId : state.heirId);
  const seats = await withE2EDb((database) =>
    database
      .select({ role: collaborators.role, isCreator: collaborators.isCreator })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, state.tripId), eq(collaborators.userId, state.heirId)))
  );
  expect(seats).toEqual(
    state.first === "operation" && state.operation !== "role" ? [] : [{ role: "manager", isCreator: true }]
  );
});

When(
  "the owner applies {string} to the manager while their HTTP removal waits",
  async ({ page, scenario }, change: string) => {
    if (change !== "demotion" && change !== "removal") throw new Error(`Unknown manager change: ${change}`);
    const state = scenario.getValue<HttpMemberRace>(HTTP_MEMBER_KEY)!;
    const [owner] = await withE2EDb((database) =>
      database.select({ username: users.username }).from(users).where(eq(users.id, state.ownerId))
    );
    const [manager] = await withE2EDb((database) =>
      database
        .select({ id: collaborators.id, userId: collaborators.userId })
        .from(collaborators)
        .where(
          and(
            eq(collaborators.tripId, state.tripId),
            eq(collaborators.role, "manager"),
            eq(collaborators.isCreator, false)
          )
        )
    );
    const { context, page: ownerPage } = await scenario.openSecondSession(page);
    const gate = await holdHttpRaceLock("collaborators", manager.id);
    let demotion: ReturnType<typeof ownerPage.request.patch> | undefined;
    let removal: ReturnType<typeof page.request.patch> | undefined;
    try {
      await scenario.signInAsUser(ownerPage, owner.username);
      demotion = ownerPage.request.patch(`/api/v1/trips/${state.tripId}/collaborators`, {
        headers: { "x-arrivo-client": "web", origin: new URL(ownerPage.url()).origin },
        data: {
          changes: [
            change === "demotion"
              ? { type: "role", collaboratorId: manager.id, fromRole: "manager", toRole: "viewer" }
              : { type: "remove", collaboratorId: manager.id },
          ],
        },
      });
      const firstPid = await gate.waitForBlockedBy(gate.pid);
      removal = page.request.patch(`/api/v1/trips/${state.tripId}/collaborators`, {
        headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
        data: { changes: [{ type: "remove", collaboratorId: state.seatId }] },
      });
      await gate.waitForBlockedBy(firstPid, "trips");
      await gate.release();
      const [demotionResponse, removalResponse] = await Promise.all([demotion, removal]);
      expect(demotionResponse.status()).toBe(200);
      state.responseStatus = removalResponse.status();
      state.first = change;
    } finally {
      await gate.close();
      await Promise.allSettled([...(demotion ? [demotion] : []), ...(removal ? [removal] : [])]);
      await context.close();
    }
  }
);

When("the manager is deleted while their HTTP removal waits on the trip", async ({ page, scenario }) => {
  const state = scenario.getValue<HttpMemberRace>(HTTP_MEMBER_KEY)!;
  const gate = await holdHttpRaceLock("trips", state.tripId);
  let removal: ReturnType<typeof page.request.patch> | undefined;
  try {
    removal = page.request.patch(`/api/v1/trips/${state.tripId}/collaborators`, {
      headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
      data: { changes: [{ type: "remove", collaboratorId: state.seatId }] },
    });
    await gate.waitForBlockedBy(gate.pid, "trips");
    const outcome = await withE2EDb((database) =>
      deleteOwnAccount(database as unknown as AccountDeletionDatabase, state.managerId, [], state.managerSessionVersion)
    );
    expect(outcome).toMatchObject({ ok: true });
    await gate.release();
    state.responseStatus = (await removal).status();
    state.first = "deletion";
  } finally {
    await gate.close();
    if (removal) await Promise.allSettled([removal]);
  }
});

Given("the heir is a viewer for authorization races", async ({ scenario }) => {
  const state = scenario.getValue<HttpMemberRace>(HTTP_MEMBER_KEY)!;
  await withE2EDb((database) =>
    database.update(collaborators).set({ role: "viewer" }).where(eq(collaborators.id, state.seatId))
  );
});

Then("the HTTP removal is refused and the heir remains a viewer", async ({ scenario }) => {
  const state = scenario.getValue<HttpMemberRace>(HTTP_MEMBER_KEY)!;
  expect(state.responseStatus).toBe(state.first === "demotion" ? 403 : 404);
  const [heir] = await withE2EDb((database) =>
    database
      .select({ role: collaborators.role, isCreator: collaborators.isCreator })
      .from(collaborators)
      .where(eq(collaborators.id, state.seatId))
  );
  expect(heir).toEqual({ role: "viewer", isCreator: false });
  if (state.first === "deletion") {
    expect(
      await withE2EDb((database) => database.select().from(users).where(eq(users.id, state.managerId)))
    ).toHaveLength(0);
  }
});

When("owner deletion of the trip holds its lock while HTTP removal queues", async ({ page, scenario }) => {
  const state = scenario.getValue<HttpMemberRace>(HTTP_MEMBER_KEY)!;
  const gate = await holdHttpRaceLock("trips", state.tripId);
  let deletion: Promise<DeleteOwnAccountResult> | undefined;
  let removal: ReturnType<typeof page.request.patch> | undefined;
  try {
    deletion = withE2EDb((database) =>
      deleteOwnAccount(
        database as unknown as AccountDeletionDatabase,
        state.ownerId,
        [{ tripId: state.tripId, action: TripDeletionAction.Delete }],
        state.sessionVersion
      )
    );
    const deletionPid = await gate.waitForBlockedBy(gate.pid, "trips");
    removal = page.request.patch(`/api/v1/trips/${state.tripId}/collaborators`, {
      headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
      data: { changes: [{ type: "remove", collaboratorId: state.seatId }] },
    });
    await gate.waitForBlockedBy(deletionPid, "trips");
    await gate.release();
    const [outcome, response] = await Promise.all([deletion, removal]);
    expect(outcome).toMatchObject({ ok: true });
    state.responseStatus = response.status();
  } finally {
    await gate.close();
    await Promise.allSettled([...(deletion ? [deletion] : []), ...(removal ? [removal] : [])]);
  }
});

Then("the HTTP removal conflicts and the trip is gone", async ({ scenario }) => {
  const state = scenario.getValue<HttpMemberRace>(HTTP_MEMBER_KEY)!;
  expect(state.responseStatus).toBe(409);
  expect(await withE2EDb((database) => database.select().from(trips).where(eq(trips.id, state.tripId)))).toHaveLength(
    0
  );
});

interface HttpAcceptanceRace {
  tripId: string;
  inviteeId: string;
  invitationId: string;
  sessionVersion: number;
  first?: string;
  responseStatus?: number;
  inviteeUsername?: string;
  responseBody?: unknown;
  ownerId?: string;
  ownerSessionVersion?: number;
}

Given("an HTTP invitation race with a manager and guest", async ({ page, scenario }) => {
  await scenario.ensureCurrentUser();
  const trip = await scenario.ensureCurrentTrip();
  const { user: manager } = await scenario.materialize({ user: { setCurrent: false } });
  const { user: guest } = await scenario.materialize({ user: { setCurrent: false } });
  if (!manager || !guest) throw new Error("Missing manager or guest.");
  const [account] = await withE2EDb(async (database) => {
    await database.insert(collaborators).values({
      tripId: trip.id,
      userId: manager.id,
      name: manager.name,
      initials: manager.initials,
      role: "manager",
      isCreator: false,
    });
    return database.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, manager.id));
  });
  scenario.setValue<HttpAcceptanceRace>(HTTP_RACE_KEY, {
    tripId: trip.id,
    inviteeId: guest.id,
    inviteeUsername: guest.username,
    invitationId: "",
    sessionVersion: account.sessionVersion,
    ownerId: manager.id,
    ownerSessionVersion: account.sessionVersion,
  });
  await scenario.signInAsUser(page, manager.username);
});

When(
  "the HTTP manager invitation races manager deletion with {string} queued first",
  async ({ page, scenario }, first: string) => {
    const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
    if (first !== "invitation" && first !== "deletion") throw new Error(`Unknown race ordering: ${first}`);
    const gate = await holdHttpRaceLock(
      first === "invitation" ? "trips" : "users",
      first === "invitation" ? state.tripId : state.ownerId!
    );
    let invitation: ReturnType<typeof page.request.post> | undefined;
    let deletion: Promise<DeleteOwnAccountResult> | undefined;
    const invite = () =>
      page.request.post(`/api/v1/trips/${state.tripId}/invitations`, {
        headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
        data: { username: state.inviteeUsername, role: "viewer" },
      });
    const deleteAccount = () =>
      withE2EDb((database) =>
        deleteOwnAccount(database as unknown as AccountDeletionDatabase, state.ownerId!, [], state.ownerSessionVersion)
      );
    try {
      if (first === "invitation") invitation = invite();
      else deletion = deleteAccount();
      const firstPid = await gate.waitForBlockedBy(gate.pid);
      if (first === "invitation") deletion = deleteAccount();
      else invitation = invite();
      await gate.waitForBlockedBy(firstPid, "users");
      await gate.release();
      const [response, outcome] = await Promise.all([invitation!, deletion!]);
      expect(outcome).toMatchObject({ ok: true });
      state.first = first;
      state.responseStatus = response.status();
      if (response.status() === 200) state.responseBody = await response.json();
    } finally {
      await gate.close();
      await Promise.allSettled([...(invitation ? [invitation] : []), ...(deletion ? [deletion] : [])]);
    }
  }
);

Then("the deleted manager leaves no invitation", async ({ scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  expect(state.responseStatus).toBe(state.first === "invitation" ? 200 : 404);
  if (state.first === "invitation") expect(state.responseBody).toEqual({ status: "invited" });
  const rows = await withE2EDb(async (database) => ({
    manager: await database.select().from(users).where(eq(users.id, state.ownerId!)),
    invitations: await database.select().from(invitations).where(eq(invitations.tripId, state.tripId)),
    ghosts: await database
      .select()
      .from(collaborators)
      .where(and(eq(collaborators.tripId, state.tripId), isNull(collaborators.userId))),
  }));
  expect(rows.manager).toHaveLength(0);
  expect(rows.invitations).toHaveLength(0);
  expect(rows.ghosts).toHaveLength(0);
});

Given("an HTTP invitation race with a lower-ID heir", async ({ page, scenario }) => {
  const first = await scenario.ensureCurrentUser();
  const { user: second } = await scenario.materialize({ user: { setCurrent: false } });
  if (!second) throw new Error("Missing heir race account.");
  const [heir, owner] = [first, second].sort((left, right) => left.id.localeCompare(right.id));
  scenario.setCurrentUser(owner);
  const trip = await scenario.ensureCurrentTrip();
  const [account] = await withE2EDb(async (database) => {
    await database.insert(collaborators).values({
      tripId: trip.id,
      userId: heir.id,
      name: heir.name,
      initials: heir.initials,
      role: "viewer",
      isCreator: false,
    });
    return database.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, owner.id));
  });
  scenario.setValue<HttpAcceptanceRace>(HTTP_RACE_KEY, {
    tripId: trip.id,
    inviteeId: heir.id,
    inviteeUsername: heir.username,
    invitationId: "",
    sessionVersion: account.sessionVersion,
    ownerId: owner.id,
    ownerSessionVersion: account.sessionVersion,
  });
  await scenario.signInAsUser(page, owner.username);
});

When("HTTP invitation holds the heir lock while owner transfer queues", async ({ page, scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  expect(state.inviteeId < state.ownerId!).toBe(true);
  const gate = await holdHttpRaceLock("users", state.ownerId!);
  let invitation: ReturnType<typeof page.request.post> | undefined;
  let deletion: Promise<DeleteOwnAccountResult> | undefined;
  try {
    invitation = page.request.post(`/api/v1/trips/${state.tripId}/invitations`, {
      headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
      data: { username: state.inviteeUsername, role: "viewer" },
    });
    const invitationPid = await gate.waitForBlockedBy(gate.pid, "users");
    deletion = withE2EDb((database) =>
      deleteOwnAccount(
        database as unknown as AccountDeletionDatabase,
        state.ownerId!,
        [{ tripId: state.tripId, action: TripDeletionAction.Transfer, newOwnerUserId: state.inviteeId }],
        state.ownerSessionVersion
      )
    );
    await gate.waitForBlockedBy(invitationPid, "users");
    await gate.release();
    const [response, outcome] = await Promise.all([invitation, deletion]);
    expect(outcome).toMatchObject({ ok: true });
    state.responseStatus = response.status();
    state.responseBody = await response.json();
  } finally {
    await gate.close();
    await Promise.allSettled([...(invitation ? [invitation] : []), ...(deletion ? [deletion] : [])]);
  }
});

Then("owner transfer succeeds without retargeting the invitation", async ({ scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  expect(state.responseStatus).toBe(200);
  expect(state.responseBody).toMatchObject({ status: "error", errorCode: "already-collaborator" });
  const rows = await withE2EDb(async (database) => ({
    trip: await database.select({ ownerId: trips.ownerId }).from(trips).where(eq(trips.id, state.tripId)),
    heir: await database
      .select({ role: collaborators.role, isCreator: collaborators.isCreator })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, state.tripId), eq(collaborators.userId, state.inviteeId))),
    invitations: await database.select().from(invitations).where(eq(invitations.tripId, state.tripId)),
  }));
  expect(rows.trip).toEqual([{ ownerId: state.inviteeId }]);
  expect(rows.heir).toEqual([{ role: "manager", isCreator: true }]);
  expect(rows.invitations).toHaveLength(0);
});

When("owner transfer holds the heir lock while HTTP invitation queues", async ({ page, scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  const gate = await holdHttpRaceLock("trips", state.tripId);
  let invitation: ReturnType<typeof page.request.post> | undefined;
  let deletion: Promise<DeleteOwnAccountResult> | undefined;
  try {
    deletion = withE2EDb((database) =>
      deleteOwnAccount(
        database as unknown as AccountDeletionDatabase,
        state.ownerId!,
        [{ tripId: state.tripId, action: TripDeletionAction.Transfer, newOwnerUserId: state.inviteeId }],
        state.ownerSessionVersion
      )
    );
    const deletionPid = await gate.waitForBlockedBy(gate.pid, "trips");
    invitation = page.request.post(`/api/v1/trips/${state.tripId}/invitations`, {
      headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
      data: { username: state.inviteeUsername, role: "viewer" },
    });
    await gate.waitForBlockedBy(deletionPid, "users");
    await gate.release();
    const [response, outcome] = await Promise.all([invitation, deletion]);
    expect(outcome).toMatchObject({ ok: true });
    state.responseStatus = response.status();
  } finally {
    await gate.close();
    await Promise.allSettled([...(invitation ? [invitation] : []), ...(deletion ? [deletion] : [])]);
  }
});

Then("owner transfer succeeds and the deleted owner cannot invite", async ({ scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  expect(state.responseStatus).toBe(404);
  const rows = await withE2EDb(async (database) => ({
    trip: await database.select({ ownerId: trips.ownerId }).from(trips).where(eq(trips.id, state.tripId)),
    heir: await database
      .select({ role: collaborators.role, isCreator: collaborators.isCreator })
      .from(collaborators)
      .where(and(eq(collaborators.tripId, state.tripId), eq(collaborators.userId, state.inviteeId))),
    invitations: await database.select().from(invitations).where(eq(invitations.tripId, state.tripId)),
  }));
  expect(rows.trip).toEqual([{ ownerId: state.inviteeId }]);
  expect(rows.heir).toEqual([{ role: "manager", isCreator: true }]);
  expect(rows.invitations).toHaveLength(0);
});

Given("an HTTP invitation race with an existing invitee", async ({ page, scenario }) => {
  const owner = await scenario.ensureCurrentUser();
  const trip = await scenario.ensureCurrentTrip();
  const { user: invitee } = await scenario.materialize({ user: { setCurrent: false } });
  if (!invitee) throw new Error("Missing invitation race invitee.");
  const [account] = await withE2EDb((database) =>
    database.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, invitee.id))
  );
  scenario.setValue<HttpAcceptanceRace>(HTTP_RACE_KEY, {
    tripId: trip.id,
    inviteeId: invitee.id,
    inviteeUsername: invitee.username,
    invitationId: "",
    sessionVersion: account.sessionVersion,
  });
  await scenario.signInAsUser(page, owner.username);
});

When("the invitee is renamed while the HTTP invitation waits for their account lock", async ({ page, scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  await page.evaluate(
    (tripId) =>
      new Promise<void>((resolve, reject) => {
        const target = window as typeof window & { renameEvents: string[]; renameHeartbeats: number };
        target.renameEvents = [];
        target.renameHeartbeats = 0;
        const source = new EventSource(`/api/trips/${tripId}/events`);
        source.onopen = () => resolve();
        source.onerror = () => reject(new Error("Trip event stream failed"));
        source.onmessage = (event) => {
          const frame = JSON.parse(event.data) as { type: string };
          if (frame.type === "heartbeat") target.renameHeartbeats += 1;
          else target.renameEvents.push(frame.type);
        };
      }),
    state.tripId
  );
  const client = postgres(process.env.E2E_DATABASE_URL!, { max: 2 });
  const holder = await client.reserve();
  let request: ReturnType<typeof page.request.post> | undefined;
  let committed = false;
  try {
    await holder`begin`;
    const [identity] = await holder`select pg_backend_pid() as pid`;
    await holder`update users set username = ${scenario.uniqueUsername("renamed")} where id = ${state.inviteeId}`;
    request = page.request.post(`/api/v1/trips/${state.tripId}/invitations`, {
      headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
      data: { username: state.inviteeUsername, role: "viewer" },
    });
    await expect
      .poll(
        async () => {
          const rows =
            await client`select pid from pg_stat_activity where ${identity.pid as number} = any(pg_blocking_pids(pid))
        and position('users' in lower(query)) > 0`;
          return rows.length;
        },
        { timeout: 15_000 }
      )
      .toBeGreaterThan(0);
    await holder`commit`;
    committed = true;
    const response = await request;
    state.responseStatus = response.status();
    state.responseBody = await response.json();
    const initialHeartbeats = await page.evaluate(
      () => (window as typeof window & { renameHeartbeats: number }).renameHeartbeats
    );
    await expect
      .poll(() => page.evaluate(() => (window as typeof window & { renameHeartbeats: number }).renameHeartbeats), {
        timeout: 20_000,
      })
      .toBeGreaterThan(initialHeartbeats);
  } finally {
    if (!committed) await holder`rollback`.catch(() => undefined);
    holder.release();
    await client.end();
    if (request) await Promise.allSettled([request]);
  }
});

Then("the HTTP invitation reports no account without creating an invitation or effects", async ({ page, scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  expect(state.responseStatus).toBe(200);
  expect(state.responseBody).toMatchObject({ status: "error", errorCode: "no-account" });
  const rows = await withE2EDb(async (database) => ({
    invitations: await database.select().from(invitations).where(eq(invitations.tripId, state.tripId)),
    activity: await database.select().from(activityEvents).where(eq(activityEvents.tripId, state.tripId)),
  }));
  expect(rows.invitations).toHaveLength(0);
  expect(rows.activity).toHaveLength(0);
  expect(await page.evaluate(() => (window as typeof window & { renameEvents: string[] }).renameEvents)).toEqual([]);
});

When(
  "the HTTP invitation races account deletion with {string} queued first",
  async ({ page, scenario }, first: string) => {
    const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
    if (first !== "invitation" && first !== "deletion") throw new Error(`Unknown race ordering: ${first}`);
    const gate = await holdHttpRaceLock(
      first === "invitation" ? "trips" : "users",
      first === "invitation" ? state.tripId : state.inviteeId
    );
    const invite = () =>
      page.request.post(`/api/v1/trips/${state.tripId}/invitations`, {
        headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
        data: { username: state.inviteeUsername, role: "viewer" },
      });
    const deleteAccount = () =>
      withE2EDb((database) =>
        deleteOwnAccount(database as unknown as AccountDeletionDatabase, state.inviteeId, [], state.sessionVersion)
      );
    let invitation: ReturnType<typeof invite> | undefined;
    let deletion: ReturnType<typeof deleteAccount> | undefined;
    try {
      if (first === "invitation") invitation = invite();
      else deletion = deleteAccount();
      const firstPid = await gate.waitForBlockedBy(gate.pid);
      if (first === "invitation") deletion = deleteAccount();
      else invitation = invite();
      await gate.waitForBlockedBy(firstPid, "users");
      await gate.release();
      const [response, outcome] = await Promise.all([invitation!, deletion!]);
      expect(outcome).toMatchObject({ ok: true });
      state.first = first;
      state.responseStatus = response.status();
      state.responseBody = await response.json();
    } finally {
      await gate.close();
      await Promise.allSettled([...(invitation ? [invitation] : []), ...(deletion ? [deletion] : [])]);
    }
  }
);

Then("the HTTP invitation race leaves no invitation for the deleted account", async ({ scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  expect(state.responseStatus).toBe(200);
  expect(state.responseBody).toMatchObject(
    state.first === "invitation" ? { status: "invited" } : { status: "error", errorCode: "no-account" }
  );
  const rows = await withE2EDb((database) =>
    database
      .select()
      .from(invitations)
      .where(and(eq(invitations.tripId, state.tripId), eq(invitations.inviteeId, state.inviteeId)))
  );
  expect(rows).toHaveLength(0);
});

Given("an HTTP acceptance race with a pending invitation", async ({ page, scenario }) => {
  const owner = await scenario.ensureCurrentUser();
  const trip = await scenario.ensureCurrentTrip();
  const { user: invitee } = await scenario.materialize({ user: { setCurrent: false } });
  if (!invitee) throw new Error("Missing acceptance race invitee.");
  const { invitationId, sessionVersion, ownerSessionVersion } = await withE2EDb(async (database) => {
    const [invitation] = await database
      .insert(invitations)
      .values({
        tripId: trip.id,
        inviteeId: invitee.id,
        invitedBy: owner.id,
        role: "editor",
        status: "pending",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      .returning({ id: invitations.id });
    const [account] = await database
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, invitee.id));
    const [ownerAccount] = await database
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, owner.id));
    return {
      invitationId: invitation.id,
      sessionVersion: account.sessionVersion,
      ownerSessionVersion: ownerAccount.sessionVersion,
    };
  });
  scenario.setValue<HttpAcceptanceRace>(HTTP_RACE_KEY, {
    tripId: trip.id,
    inviteeId: invitee.id,
    invitationId,
    sessionVersion,
    ownerId: owner.id,
    ownerSessionVersion,
  });
  await scenario.signInAsUser(page, invitee.username);
});

When("HTTP acceptance and owner deletion queue behind a held membership insert", async ({ page, scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  const gate = await holdHttpRaceLock("membership-insert", state.tripId, state.inviteeId);
  let acceptance: ReturnType<typeof page.request.post> | undefined;
  let deletion: Promise<DeleteOwnAccountResult> | undefined;
  try {
    acceptance = page.request.post(`/api/v1/invitations/${state.invitationId}/accept`, {
      headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
      data: {},
    });
    await gate.waitForBlockedBy(gate.pid, "users");
    deletion = withE2EDb((database) =>
      deleteOwnAccount(database as unknown as AccountDeletionDatabase, state.ownerId!, [], state.ownerSessionVersion)
    );
    await gate.waitForBlockedBy(gate.pid, "trips");
    await gate.release();
    const [response, outcome] = await Promise.all([acceptance, deletion]);
    expect(outcome).toMatchObject({ ok: true });
    expect([200, 404]).toContain(response.status());
  } finally {
    await gate.close();
    await Promise.allSettled([...(acceptance ? [acceptance] : []), ...(deletion ? [deletion] : [])]);
  }
});

Then("owner deletion removes the trip without a partial invitation or ghost membership", async ({ scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  const rows = await withE2EDb(async (database) => ({
    owner: await database.select().from(users).where(eq(users.id, state.ownerId!)),
    invitee: await database.select().from(users).where(eq(users.id, state.inviteeId)),
    trip: await database.select().from(trips).where(eq(trips.id, state.tripId)),
    invitation: await database.select().from(invitations).where(eq(invitations.id, state.invitationId)),
    members: await database.select().from(collaborators).where(eq(collaborators.tripId, state.tripId)),
  }));
  expect(rows.owner).toHaveLength(0);
  expect(rows.invitee).toHaveLength(1);
  expect(rows.trip).toHaveLength(0);
  expect(rows.invitation).toHaveLength(0);
  expect(rows.members).toHaveLength(0);
});

When(
  "the HTTP acceptance races account deletion with {string} queued first",
  async ({ page, scenario }, first: string) => {
    const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
    if (first !== "acceptance" && first !== "deletion") throw new Error(`Unknown race ordering: ${first}`);
    const gate = await holdHttpRaceLock(
      first === "acceptance" ? "trips" : "users",
      first === "acceptance" ? state.tripId : state.inviteeId
    );
    const accept = () =>
      page.request.post(`/api/v1/invitations/${state.invitationId}/accept`, {
        headers: { "x-arrivo-client": "web", origin: new URL(page.url()).origin },
        data: {},
      });
    const deleteAccount = () =>
      withE2EDb((database) =>
        deleteOwnAccount(database as unknown as AccountDeletionDatabase, state.inviteeId, [], state.sessionVersion)
      );
    let acceptance: ReturnType<typeof accept> | undefined;
    let deletion: ReturnType<typeof deleteAccount> | undefined;
    try {
      if (first === "acceptance") acceptance = accept();
      else deletion = deleteAccount();
      const firstPid = await gate.waitForBlockedBy(gate.pid);
      if (first === "acceptance") deletion = deleteAccount();
      else acceptance = accept();
      await gate.waitForBlockedBy(firstPid, "users");
      await gate.release();
      const [response, outcome] = await Promise.all([acceptance!, deletion!]);
      expect(outcome).toMatchObject({ ok: true });
      state.first = first;
      state.responseStatus = response.status();
    } finally {
      await gate.close();
      await Promise.allSettled([...(acceptance ? [acceptance] : []), ...(deletion ? [deletion] : [])]);
    }
  }
);

Then("the HTTP acceptance race leaves no partial membership or invitation", async ({ scenario }) => {
  const state = scenario.getValue<HttpAcceptanceRace>(HTTP_RACE_KEY)!;
  expect(state.responseStatus).toBe(state.first === "acceptance" ? 200 : 404);
  const rows = await withE2EDb(async (database) => ({
    account: await database.select().from(users).where(eq(users.id, state.inviteeId)),
    invitation: await database.select().from(invitations).where(eq(invitations.id, state.invitationId)),
    members: await database
      .select()
      .from(collaborators)
      .where(and(eq(collaborators.tripId, state.tripId), isNull(collaborators.userId))),
  }));
  expect(rows.account).toHaveLength(0);
  expect(rows.invitation).toHaveLength(0);
  expect(rows.members).toHaveLength(0);
});

type Scenario = ScenarioFixtureContext;
type Gate = ReturnType<typeof createLockGate>;
type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown };

const fixtureOf = (scenario: Scenario) => scenario.getValue<DeletionConcurrencyFixture>(FIXTURE_KEY)!;
const outcomesOf = (scenario: Scenario) => {
  let outcomes = scenario.getValue<Map<string, Outcome>>(OUTCOMES_KEY);
  if (!outcomes) {
    outcomes = new Map();
    scenario.setValue(OUTCOMES_KEY, outcomes);
  }
  return outcomes;
};

After(async ({ scenario }) => {
  await scenario.getValue<DeletionConcurrencyFixture>(FIXTURE_KEY)?.close();
});

// Registered with the scenario before any seeding so a failed setup still drops the schema.
async function startFixture(scenario: Scenario, memberKeys: string[]) {
  const fixture = await createDeletionConcurrencyFixture();
  scenario.setValue(FIXTURE_KEY, fixture);
  // Only scenarios with an heir pin ID order (heir lowest); every other scenario keeps random IDs.
  const orderedIds = memberKeys.map(() => randomUUID()).sort();
  const orderedKeys = memberKeys.includes("heir")
    ? [...memberKeys].sort((left, right) => (left === "heir" ? -1 : right === "heir" ? 1 : left.localeCompare(right)))
    : memberKeys;
  await fixture.seedUsers([
    { key: "admin", role: UserRole.Admin },
    ...orderedKeys.map((key, index) => ({
      key,
      ...(memberKeys.includes("heir") ? { id: orderedIds[index] } : {}),
      role: UserRole.Member,
    })),
  ]);
}

const settle = (promise: Promise<unknown>): Promise<Outcome> =>
  promise.then(
    (value): Outcome => ({ ok: true, value }),
    (error: unknown): Outcome => ({ ok: false, error })
  );

function isRole(value: string): value is CollaboratorRole {
  return Object.values(CollaboratorRole).some((role) => role === value);
}

function roleOf(value: string): CollaboratorRole {
  if (!isRole(value)) throw new Error(`Unknown collaborator role "${value}".`);
  return value;
}

interface Operation {
  /** Number of lock acquisitions (execute statements) after which the operation holds everything it will lock. */
  locks(fixture: DeletionConcurrencyFixture, scenario: Scenario): Promise<number>;
  run(fixture: DeletionConcurrencyFixture, scenario: Scenario, gate: Gate | undefined, locks: number): Promise<unknown>;
}

function gatedOptions(gate: Gate | undefined, afterExecutes: number): GatedDatabaseOptions | undefined {
  return gate ? { gate, afterExecutes } : undefined;
}

const OPERATIONS: { pattern: RegExp; build(match: RegExpMatchArray): Operation }[] = [
  {
    // App singleton, the account, then each owned trip.
    pattern: /^deletion of (\w+)$/,
    build: ([, user]) => ({
      locks: async (fixture, scenario) =>
        1 +
        new Set([
          fixture.userId(user),
          ...(scenario.getValue<TripDeletionChoice[]>(CHOICES_KEY) ?? []).flatMap((choice) =>
            choice.action === TripDeletionAction.Transfer ? [choice.newOwnerUserId] : []
          ),
        ]).size +
        (await fixture.ownedTripCount(user)),
      run: async (fixture, scenario, gate, locks) =>
        deleteOwnAccount(
          fixture.database(gatedOptions(gate, locks)),
          fixture.userId(user),
          scenario.getValue<TripDeletionChoice[]>(CHOICES_KEY) ?? [],
          await fixture.sessionVersion(user)
        ),
    }),
  },
  {
    // The gate fires inside `prepare`, once the owner row is locked.
    pattern: /^trip creation by (\w+)$/,
    build: ([, user]) => ({
      locks: async () => 1,
      run: (fixture, _scenario, gate) =>
        createTripWrite(fixture.database(), fixture.userId(user), async () => {
          await gate?.arrive();
          return {
            tripValues: { name: "Created concurrently" },
            collaboratorName: user,
            buildDayRows: (tripId) => ({ tripId, dayNumber: 1, label: "Day 1" }),
          };
        }),
    }),
  },
];

function operationFor(spec: string): Operation {
  for (const { pattern, build } of OPERATIONS) {
    const match = spec.match(pattern);
    if (match) return build(match);
  }
  throw new Error(`Unknown concurrent operation "${spec}".`);
}

function start(scenario: Scenario, spec: string, gate?: Gate): Promise<Outcome> {
  const fixture = fixtureOf(scenario);
  const operation = operationFor(spec);
  const outcome = operation.locks(fixture, scenario).then((locks) => operation.run(fixture, scenario, gate, locks));
  const settled = settle(outcome).then((result) => {
    outcomesOf(scenario).set(spec, result);
    return result;
  });
  return settled;
}

Given("an isolated app with an admin and members {string}", async ({ scenario }, members: string) => {
  await startFixture(
    scenario,
    members.split(",").map((key) => key.trim())
  );
});

Given("{word} owns trip {word}", async ({ scenario }, owner: string, trip: string) => {
  await fixtureOf(scenario).seedTrip(trip, owner);
});

Given("{word} is {word} on trip {word}", async ({ scenario }, user: string, role: string, trip: string) => {
  await fixtureOf(scenario).addMember(trip, user, roleOf(role));
});

Given(
  "{word} has a pending {word} invitation {word} to trip {word} from {word}",
  async ({ scenario }, invitee: string, role: string, invitation: string, trip: string, inviter: string) => {
    await fixtureOf(scenario).seedInvitation(invitation, trip, invitee, inviter, roleOf(role));
  }
);

Given(
  "{word} chooses to transfer trip {word} to {word}",
  async ({ scenario }, _owner: string, trip: string, heir: string) => {
    const fixture = fixtureOf(scenario);
    const choices = scenario.getValue<TripDeletionChoice[]>(CHOICES_KEY) ?? [];
    scenario.setValue(CHOICES_KEY, [
      ...choices,
      { tripId: fixture.tripId(trip), action: TripDeletionAction.Transfer, newOwnerUserId: fixture.userId(heir) },
    ]);
  }
);

Given("{word} chooses to delete trip {word}", async ({ scenario }, _owner: string, trip: string) => {
  const choices = scenario.getValue<TripDeletionChoice[]>(CHOICES_KEY) ?? [];
  scenario.setValue(CHOICES_KEY, [
    ...choices,
    { tripId: fixtureOf(scenario).tripId(trip), action: TripDeletionAction.Delete },
  ]);
});

When("{string} holds its locks while {string} runs", async ({ scenario }, first: string, second: string) => {
  const fixture = fixtureOf(scenario);
  const gate = createLockGate();

  const firstOutcome = start(scenario, first, gate);
  await Promise.race([
    gate.reached,
    firstOutcome.then((outcome) => {
      throw new Error(
        `"${first}" finished without holding its locks (${outcome.ok ? "completed" : String(outcome.error)}).`
      );
    }),
  ]);

  // The second operation either queues behind the first's locks or finishes without needing them.
  const secondOutcome = start(scenario, second);
  try {
    await Promise.race([fixture.waitForBlockedTransactions(1), secondOutcome]);
  } finally {
    gate.release();
  }
  await Promise.all([firstOutcome, secondOutcome]);
});

When("{word} deletes their account with the chosen outcomes", async ({ scenario }, user: string) => {
  await start(scenario, `deletion of ${user}`);
});

function outcomeOf(scenario: Scenario, spec: string): Outcome {
  const outcome = outcomesOf(scenario).get(spec);
  if (!outcome) throw new Error(`"${spec}" never ran.`);
  return outcome;
}

function fulfilled(scenario: Scenario, spec: string): unknown {
  const outcome = outcomeOf(scenario, spec);
  if (!outcome.ok) throw new Error(`"${spec}" threw: ${String(outcome.error)}`, { cause: outcome.error });
  return outcome.value;
}

Then("neither operation hit a deadlock", async ({ scenario }) => {
  for (const [spec, outcome] of outcomesOf(scenario)) {
    if (outcome.ok) continue;
    const text = JSON.stringify({
      message: String((outcome.error as Error)?.message),
      code: (outcome.error as { code?: string })?.code,
      cause: String((outcome.error as { cause?: unknown })?.cause),
    });
    expect(text, `"${spec}" failed`).not.toMatch(/deadlock|40P01/i);
  }
});

Then("{string} succeeded", async ({ scenario }, spec: string) => {
  const value = fulfilled(scenario, spec);
  if (spec.startsWith("deletion of")) expect(value).toMatchObject({ ok: true });
  else if (spec.startsWith("trip creation")) expect(value).toMatchObject({ tripId: expect.any(String) });
  else if (spec.startsWith("acceptance")) expect(value).toMatchObject({ status: "accepted" });
  else if (spec.startsWith("invite")) expect(value).toMatchObject({ status: "invited" });
});

Then("{string} was refused as stale", async ({ scenario }, spec: string) => {
  const outcome = outcomeOf(scenario, spec);
  if (outcome.ok) {
    expect(outcome.value).toEqual({ ok: false, reason: AccountDeletionFailure.Stale });
  } else {
    expect(outcome.error).toBeInstanceOf(ContributorChangeGuardError);
    expect((outcome.error as ContributorChangeGuardError).stale).toBe(true);
  }
});

Then("{string} was refused with {string}", async ({ scenario }, spec: string, message: string) => {
  const outcome = outcomeOf(scenario, spec);
  if (outcome.ok) throw new Error(`"${spec}" succeeded instead of being refused.`);
  expect((outcome.error as Error).message).toBe(message);
});

Then("{string} accepted nothing", async ({ scenario }, spec: string) => {
  expect(fulfilled(scenario, spec)).toBeNull();
});

Then("{string} reported the inviter gone", async ({ scenario }, spec: string) => {
  expect(fulfilled(scenario, spec)).toEqual({ status: "gone" });
});

Then("the account of {word} no longer exists", async ({ scenario }, user: string) => {
  expect(await fixtureOf(scenario).accountExists(user)).toBe(false);
});

Then("the account of {word} still exists", async ({ scenario }, user: string) => {
  expect(await fixtureOf(scenario).accountExists(user)).toBe(true);
});

Then("no trip remains", async ({ scenario }) => {
  expect(await fixtureOf(scenario).tripCount()).toBe(0);
});

Then("trip {word} is owned by {word}", async ({ scenario }, trip: string, owner: string) => {
  const fixture = fixtureOf(scenario);
  expect(await fixture.tripOwner(trip)).toBe(fixture.userId(owner));
});

Then("trip {word} no longer exists", async ({ scenario }, trip: string) => {
  expect(await fixtureOf(scenario).tripOwner(trip)).toBeNull();
});

Then(
  "{word} holds the {word} role on trip {word} as creator {word}",
  async ({ scenario }, user: string, role: string, trip: string, creator: string) => {
    expect(await fixtureOf(scenario).membershipRole(trip, user)).toEqual({
      role,
      isCreator: creator === "true",
    });
  }
);

Then("{word} is a member of trip {word}", async ({ scenario }, user: string, trip: string) => {
  expect(await fixtureOf(scenario).membershipRole(trip, user)).not.toBeNull();
});

Then("{word} is not a member of trip {word}", async ({ scenario }, user: string, trip: string) => {
  expect(await fixtureOf(scenario).membershipRole(trip, user)).toBeNull();
});

Then("no collaborator row lacks an account", async ({ scenario }) => {
  expect(await fixtureOf(scenario).ghostMemberCount()).toBe(0);
});

Then("no invitation remains", async ({ scenario }) => {
  expect(await fixtureOf(scenario).invitationCount()).toBe(0);
});

Then("invitation {word} is {word}", async ({ scenario }, invitation: string, status: string) => {
  expect(await fixtureOf(scenario).invitationStatus(invitation)).toBe(status);
});

Then(
  "the deletion summary transfers trip {word} to {word} and deletes trip {word} with member {word}",
  async ({ scenario }, transferred: string, heir: string, deleted: string, member: string) => {
    const fixture = fixtureOf(scenario);
    const result = fulfilled(scenario, "deletion of owner") as DeleteOwnAccountResult;
    if (!result.ok) throw new Error(`Deletion refused: ${result.reason}`);
    expect(result.summary).toMatchObject({
      rescindedInvitations: [],
      transferredTrips: [[fixture.tripId(transferred), fixture.userId(heir)]],
      deletedTripIds: [fixture.tripId(deleted)],
      deletedTripMembers: [{ tripId: fixture.tripId(deleted), userId: fixture.userId(member) }],
      remainingTripIds: [fixture.tripId(transferred)],
    });
  }
);
