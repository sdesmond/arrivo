import { expect } from "@playwright/test";
import {
  AccountDeletionFailure,
  CollaboratorRole,
  TripDeletionAction,
  UserRole,
  type DeleteOwnAccountResult,
  type TripDeletionChoice,
} from "../../../src/data/types";
import { deleteOwnAccount } from "../../../src/lib/account-deletion";
import {
  acceptInvitationWrite,
  ContributorChangeGuardError,
  createTripWrite,
  inviteContributorWrite,
  leaveTripWrite,
  saveContributorChangesWrite,
} from "../../../src/lib/membership-writes";
import { After, Given, When, Then } from "../fixtures";
import {
  createDeletionConcurrencyFixture,
  type DeletionConcurrencyFixture,
  type GatedDatabaseOptions,
} from "../deletion-concurrency-fixture";
import { createLockGate } from "../role-service-fixture";
import type { ScenarioFixtureContext } from "../scenario-fixture";

const FIXTURE_KEY = "deletionConcurrencyFixture";
const CHOICES_KEY = "deletionConcurrencyChoices";
const OUTCOMES_KEY = "deletionConcurrencyOutcomes";

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
  await fixture.seedUsers([
    { key: "admin", role: UserRole.Admin },
    ...memberKeys.map((key) => ({ key, role: UserRole.Member })),
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
      locks: async (fixture) => 2 + (await fixture.ownedTripCount(user)),
      run: (fixture, scenario, gate, locks) =>
        deleteOwnAccount(
          fixture.database(gatedOptions(gate, locks)),
          fixture.userId(user),
          scenario.getValue<TripDeletionChoice[]>(CHOICES_KEY) ?? []
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
  {
    pattern: /^acceptance of invitation (\w+) by (\w+)$/,
    build: ([, invitation, user]) => ({
      locks: async () => 2,
      run: (fixture, _scenario, gate, locks) =>
        acceptInvitationWrite(fixture.database(gatedOptions(gate, locks)), {
          userId: fixture.userId(user),
          fallbackName: user,
          invitationId: fixture.invitationId(invitation),
        }),
    }),
  },
  {
    pattern: /^invite of (\w+) to trip (\w+) by (\w+)$/,
    build: ([, invitee, trip, inviter]) => ({
      locks: async () => 3,
      run: (fixture, _scenario, gate, locks) =>
        inviteContributorWrite(fixture.database(gatedOptions(gate, locks)), {
          tripId: fixture.tripId(trip),
          inviterId: fixture.userId(inviter),
          inviteeId: fixture.userId(invitee),
          role: CollaboratorRole.Viewer,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
    }),
  },
  {
    pattern: /^removal of (\w+) from trip (\w+) by (\w+)$/,
    build: ([, member, trip, manager]) => ({
      locks: async () => 1,
      run: async (fixture, _scenario, gate, locks) => {
        const database = fixture.database(gatedOptions(gate, locks));
        const collaboratorId = await fixture.collaboratorId(trip, member);
        return saveContributorChangesWrite(database, {
          tripId: fixture.tripId(trip),
          actorId: fixture.userId(manager),
          changes: [{ type: "remove", collaboratorId }],
        });
      },
    }),
  },
  {
    pattern: /^role change of (\w+) on trip (\w+) by (\w+)$/,
    build: ([, member, trip, manager]) => ({
      locks: async () => 1,
      run: async (fixture, _scenario, gate, locks) => {
        const database = fixture.database(gatedOptions(gate, locks));
        const collaboratorId = await fixture.collaboratorId(trip, member);
        return saveContributorChangesWrite(database, {
          tripId: fixture.tripId(trip),
          actorId: fixture.userId(manager),
          changes: [
            { type: "role", collaboratorId, fromRole: CollaboratorRole.Editor, toRole: CollaboratorRole.Viewer },
          ],
        });
      },
    }),
  },
  {
    pattern: /^leaving of trip (\w+) by (\w+)$/,
    build: ([, trip, user]) => ({
      locks: async () => 1,
      run: (fixture, _scenario, gate, locks) =>
        leaveTripWrite(fixture.database(gatedOptions(gate, locks)), {
          tripId: fixture.tripId(trip),
          userId: fixture.userId(user),
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

When(
  "{string} is held at its collaborator insert while {string} runs and then releases",
  async ({ scenario }, accept: string, deletion: string) => {
    const fixture = fixtureOf(scenario);
    const held = await fixture.holdCollaboratorInsert("shared", "invitee");
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await held.release();
    };
    try {
      const acceptOutcome = start(scenario, accept);
      await fixture.waitForBlockedTransactions(1);
      const deletionOutcome = start(scenario, deletion);
      await fixture.waitForBlockedTransactions(2);
      await release();
      await Promise.all([acceptOutcome, deletionOutcome]);
    } finally {
      await release();
    }
  }
);

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
