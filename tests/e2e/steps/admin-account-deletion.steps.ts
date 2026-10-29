import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { activityEvents, collaborators, trips, users } from "../../../src/db/schema";
import {
  CollaboratorRole,
  UserRole,
  type AdminDeletionOutcome,
  type AdminDeletionPreview,
  type AdminDeletionPreviewResult,
} from "../../../src/data/types";
import { deleteAccountAsAdmin, previewAccountDeletionAsAdmin } from "../../../src/lib/account-deletion";
import { After, Given, When, Then } from "../fixtures";
import { withE2EDb } from "../e2e-db";
import { waitForServerActionResponse } from "../server-action";
import { createAdminDeletionFixture, type AdminDeletionFixture } from "../admin-account-deletion-fixture";
import { createLockGate } from "../role-service-fixture";
import type { ScenarioFixtureContext, ScenarioTripRecord, ScenarioUserRecord } from "../scenario-fixture";

type Scenario = ScenarioFixtureContext;

// ── Browser scenarios: the real app, a scenario-owned account and trip ──────────────────────────────────────────
const SEEDED_KEY = "adminDeletionSeeded";
const REVIEW_BODY_KEY = "adminDeletionReviewBody";

interface SeededAccount {
  owner: ScenarioUserRecord;
  trip: ScenarioTripRecord;
  members: { user: ScenarioUserRecord; role: CollaboratorRole }[];
}

const seededOf = (scenario: Scenario) => scenario.getValue<SeededAccount>(SEEDED_KEY)!;

// Collaborators are added a day apart, in order, so "earliest added" is unambiguous.
async function seedOwnedTrip(scenario: Scenario, roles: CollaboratorRole[]) {
  const { user: owner } = await scenario.materialize({ user: { setCurrent: false } });
  if (!owner) throw new Error("Failed to create the account to delete.");
  const { trip } = await scenario.materialize({
    trip: { ownerId: owner.id, overrides: { trip: { name: scenario.uniqueName("Private trip") } }, setCurrent: false },
  });
  if (!trip) throw new Error("Failed to create the account's trip.");
  const members: SeededAccount["members"] = [];
  for (const [index, role] of roles.entries()) {
    const { user } = await scenario.materialize({
      user: {
        overrides: { user: { name: scenario.uniqueName(`Collaborator ${index + 1}`), initials: "CO" } },
        setCurrent: false,
      },
    });
    if (!user) throw new Error("Failed to create a collaborator.");
    await withE2EDb((database) =>
      database.insert(collaborators).values({
        tripId: trip.id,
        userId: user.id,
        name: user.name,
        initials: user.initials,
        role,
        isCreator: false,
        addedAt: new Date(Date.UTC(2026, 0, 1 + index)),
      })
    );
    members.push({ user, role });
  }
  scenario.setValue<SeededAccount>(SEEDED_KEY, { owner, trip, members });
}

Given("a completed account owns a private trip shared with an editor and a viewer", async ({ scenario }) => {
  await seedOwnedTrip(scenario, [CollaboratorRole.Editor, CollaboratorRole.Viewer]);
});
Given("a completed account owns a private trip shared with only a viewer", async ({ scenario }) => {
  await seedOwnedTrip(scenario, [CollaboratorRole.Viewer]);
});
Given("a completed account owns a private trip shared with two editors", async ({ scenario }) => {
  await seedOwnedTrip(scenario, [CollaboratorRole.Editor, CollaboratorRole.Editor]);
});

async function reviewDeletionOf(page: Page, scenario: Scenario, username: string) {
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users", timeoutMs: 15_000 });
  const trigger = page.getByRole("button", { name: `Delete account: ${username}`, exact: true });
  const dialog = page.getByRole("dialog");
  // A click before the page hydrates opens nothing, so retry until the dialog is up.
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 10_000 });
  scenario.setValue(REVIEW_BODY_KEY, await (await response)!.text());
  await expect(page.getByRole("dialog")).toContainText(/will pass|will be deleted|owns no trips/);
}

When("I review deleting the completed account", async ({ page, scenario }) => {
  await reviewDeletionOf(page, scenario, seededOf(scenario).owner.username);
});
When("I review deleting my own account", async ({ page, scenario }) => {
  await reviewDeletionOf(page, scenario, (await scenario.ensureCurrentUser()).username);
});

Then("the review reports {int} passing on and {int} deleted", async ({ page }, passing: number, deleted: number) => {
  const dialog = page.getByRole("dialog");
  const passingText = dialog.getByText(/will pass to the earliest manager or editor/);
  const deletedText = dialog.getByText(/with no manager or editor left will be deleted/);
  if (passing === 0) await expect(passingText).toHaveCount(0);
  else await expect(passingText).toContainText(`${passing} ${passing === 1 ? "trip" : "trips"}`);
  if (deleted === 0) await expect(deletedText).toHaveCount(0);
  else await expect(deletedText).toContainText(`${deleted} ${deleted === 1 ? "trip" : "trips"}`);
});

Then("the review exposes no trip or collaborator detail", async ({ page, scenario }) => {
  const { trip, members } = seededOf(scenario);
  const dialogMarkup = await page.getByRole("dialog").innerHTML();
  const reviewBody = scenario.getValue<string>(REVIEW_BODY_KEY)!;
  const pageMarkup = await page.content();
  // Users legitimately lists every account, so only the trip is checked against the whole page.
  for (const privateValue of [trip.id, trip.name]) {
    expect(pageMarkup).not.toContain(privateValue);
  }
  for (const privateValue of [
    trip.id,
    trip.name,
    ...members.flatMap((member) => [member.user.id, member.user.name, member.user.username]),
  ]) {
    expect(dialogMarkup).not.toContain(privateValue);
    expect(reviewBody).not.toContain(privateValue);
  }
});

When("I confirm the reviewed deletion", async ({ page }) => {
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Delete account$/ })
    .click();
  await response;
});

When("I confirm deleting my own account after review", async ({ page, scenario }) => {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Delete account$/ })
    .click();
  // Success answers the action POST with signOut's redirect, sent only after the transaction commits.
  await page.waitForURL("**/sign-in**", { timeout: 15_000 });
  scenario.signOut();
});

When("the first editor leaves the trip after review", async ({ scenario }) => {
  const { trip, members } = seededOf(scenario);
  await withE2EDb((database) =>
    database
      .delete(collaborators)
      .where(and(eq(collaborators.tripId, trip.id), eq(collaborators.userId, members[0].user.id)))
  );
});

const accountsNamed = (id: string) =>
  withE2EDb((database) => database.select({ id: users.id }).from(users).where(eq(users.id, id)));

Then("the dialog asks for a renewed confirmation and nothing was deleted", async ({ page, scenario }) => {
  const { owner, trip } = seededOf(scenario);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Trips changed since you reviewed them");
  expect(await accountsNamed(owner.id)).toEqual([{ id: owner.id }]);
  const [row] = await withE2EDb((database) =>
    database.select({ ownerId: trips.ownerId }).from(trips).where(eq(trips.id, trip.id))
  );
  expect(row.ownerId).toBe(owner.id);
});

const heirFor = (scenario: Scenario, which: string) => {
  const editors = seededOf(scenario).members.filter((member) => member.role === CollaboratorRole.Editor);
  const heir = which === "second editor" ? editors[1] : editors[0];
  if (!heir) throw new Error(`No "${which}" was seeded.`);
  return heir.user;
};

Then("the completed account is gone and its trip passes to the {string}", async ({ scenario }, which: string) => {
  const { owner, trip } = seededOf(scenario);
  const heir = heirFor(scenario, which);
  expect(await accountsNamed(owner.id)).toEqual([]);
  const { row, memberships } = await withE2EDb(async (database) => ({
    row: (await database.select({ ownerId: trips.ownerId }).from(trips).where(eq(trips.id, trip.id)))[0],
    memberships: await database
      .select({ userId: collaborators.userId, role: collaborators.role, isCreator: collaborators.isCreator })
      .from(collaborators)
      .where(eq(collaborators.tripId, trip.id)),
  }));
  expect(row.ownerId).toBe(heir.id);
  expect(memberships.find((membership) => membership.userId === heir.id)).toMatchObject({
    role: "manager",
    isCreator: true,
  });
  expect(memberships.filter((membership) => membership.isCreator)).toHaveLength(1);
  expect(memberships.some((membership) => membership.userId === owner.id)).toBe(false);
});

Then("the completed account is gone and its trip no longer exists", async ({ scenario }) => {
  const { owner, trip } = seededOf(scenario);
  expect(await accountsNamed(owner.id)).toEqual([]);
  const remaining = await withE2EDb((database) =>
    database.select({ id: trips.id }).from(trips).where(eq(trips.id, trip.id))
  );
  expect(remaining).toEqual([]);
});

Then("I am still signed in on Users", async ({ page }) => {
  await page.reload();
  await expect(page.getByRole("list", { name: "App users" })).toBeVisible();
});

Then("account deletion Activity identifies only the admin and target", async ({ scenario }) => {
  const { owner, trip, members } = seededOf(scenario);
  const read = () =>
    withE2EDb((database) =>
      database
        .select()
        .from(activityEvents)
        .where(and(eq(activityEvents.targetId, owner.id), eq(activityEvents.type, "account_deleted_by_admin")))
    );
  await expect.poll(async () => (await read()).length).toBe(1);
  const [event] = await read();
  expect(event.actorId).toBe(scenario.currentUser!.id);
  expect(event.actorUsername).toBe(scenario.currentUser!.username);
  expect(event.targetUsername).toBe(owner.username);
  const serialized = JSON.stringify(event);
  for (const privateValue of [trip.id, trip.name, ...members.map((member) => member.user.id)]) {
    expect(serialized).not.toContain(privateValue);
  }
});

Then("I am signed out and my account is gone", async ({ page, scenario }) => {
  await expect(page).toHaveURL(/\/sign-in/);
  expect(await accountsNamed(scenario.currentUser!.id)).toEqual([]);
});

// ── Service scenarios: real Postgres in an isolated schema, with the lock gates of deletion-concurrency ─────────
const FIXTURE_KEY = "adminDeletionFixture";
const REVIEW_KEY = "adminDeletionReview";
const OUTCOME_KEY = "adminDeletionOutcome";

type Outcome = AdminDeletionOutcome;

const fixtureOf = (scenario: Scenario) => scenario.getValue<AdminDeletionFixture>(FIXTURE_KEY)!;
const keysOf = (list: string) =>
  list
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

After(async ({ scenario }) => {
  await scenario.getValue<AdminDeletionFixture>(FIXTURE_KEY)?.close();
});

Given(
  "an isolated admin deletion app with admins {string} and members {string}",
  async ({ scenario }, admins: string, members: string) => {
    const fixture = await createAdminDeletionFixture((created) => scenario.setValue(FIXTURE_KEY, created));
    await fixture.seedAccounts([
      ...keysOf(admins).map((key) => ({ key, role: UserRole.Admin, completed: true })),
      // "key:pending" is an account that never finished setup.
      ...keysOf(members).map((entry) => {
        const [key, state] = entry.split(":");
        return { key, role: UserRole.Member, completed: state !== "pending" };
      }),
    ]);
  }
);
Given("{word} will own trip {word}", async ({ scenario }, owner: string, trip: string) => {
  await fixtureOf(scenario).seedTrip(trip, owner);
});
Given(
  "{word} will be {word} on trip {word} since {string}",
  async ({ scenario }, user: string, role: string, trip: string, since: string) => {
    const matched = Object.values(CollaboratorRole).find((candidate) => candidate === role);
    if (!matched) throw new Error(`Unknown collaborator role "${role}".`);
    await fixtureOf(scenario).setMembership(trip, user, matched, since);
  }
);
Given("trip {word} has a seat without an account", async ({ scenario }, trip: string) => {
  await fixtureOf(scenario).addSeat(trip, "Empty seat");
});

async function review(scenario: Scenario, adminKey: string, targetKey: string): Promise<AdminDeletionPreviewResult> {
  const fixture = fixtureOf(scenario);
  return previewAccountDeletionAsAdmin(fixture.database(), await fixture.actor(adminKey), fixture.userId(targetKey));
}
async function confirm(
  scenario: Scenario,
  adminKey: string,
  targetKey: string,
  preview: AdminDeletionPreview,
  gate?: ReturnType<typeof createLockGate>
): Promise<AdminDeletionOutcome> {
  const fixture = fixtureOf(scenario);
  const database = fixture.database(gate && { gate, afterExecutes: await fixture.lockCount(targetKey, adminKey) });
  return deleteAccountAsAdmin(database, await fixture.actor(adminKey), fixture.userId(targetKey), preview.fingerprint);
}

When("the admin {word} deletes {word} after reviewing", async ({ scenario }, adminKey: string, targetKey: string) => {
  const reviewed = await review(scenario, adminKey, targetKey);
  scenario.setValue<Outcome>(
    OUTCOME_KEY,
    reviewed.ok ? await confirm(scenario, adminKey, targetKey, reviewed.preview) : reviewed
  );
});
When("the admin {word} reviews deleting {word}", async ({ scenario }, adminKey: string, targetKey: string) => {
  const reviewed = await review(scenario, adminKey, targetKey);
  if (!reviewed.ok) throw new Error(`Review refused: ${reviewed.reason}`);
  scenario.setValue(REVIEW_KEY, reviewed.preview);
});
When("{word} leaves trip {word} before the admin confirms", async ({ scenario }, user: string, trip: string) => {
  await fixtureOf(scenario).removeMembership(trip, user);
});
When(
  "the admin {word} confirms deleting {word} with the earlier review",
  async ({ scenario }, adminKey: string, targetKey: string) => {
    scenario.setValue<Outcome>(
      OUTCOME_KEY,
      await confirm(scenario, adminKey, targetKey, scenario.getValue<AdminDeletionPreview>(REVIEW_KEY)!)
    );
  }
);
When(
  "the admin {word} confirms deleting {word} with the refreshed review",
  async ({ scenario }, adminKey: string, targetKey: string) => {
    const refused = scenario.getValue<Outcome>(OUTCOME_KEY);
    if (!refused || refused.ok || !refused.preview) throw new Error("There is no refreshed review to confirm.");
    scenario.setValue<Outcome>(OUTCOME_KEY, await confirm(scenario, adminKey, targetKey, refused.preview));
  }
);
When(
  "a role change making {word} a member holds its locks while the admin {word} deletes {word}",
  async ({ scenario }, demotedKey: string, adminKey: string, targetKey: string) => {
    const fixture = fixtureOf(scenario);
    const reviewed = await review(scenario, adminKey, targetKey);
    if (!reviewed.ok) throw new Error(`Review refused: ${reviewed.reason}`);
    const held = await fixture.holdRoleChange(demotedKey, UserRole.Member);
    let deletion: Promise<AdminDeletionOutcome> | undefined;
    try {
      deletion = confirm(scenario, adminKey, targetKey, reviewed.preview);
      await fixture.waitForBlockedTransactions();
    } finally {
      await held.release();
    }
    scenario.setValue<Outcome>(OUTCOME_KEY, await deletion);
  }
);
When(
  "the admin {word} deleting {word} holds its locks while the admin {word} deleting {word} runs",
  async ({ scenario }, firstAdmin: string, firstTarget: string, secondAdmin: string, secondTarget: string) => {
    const fixture = fixtureOf(scenario);
    const firstReview = await review(scenario, firstAdmin, firstTarget);
    const secondReview = await review(scenario, secondAdmin, secondTarget);
    if (!firstReview.ok || !secondReview.ok) throw new Error("Both reviews must succeed before the race.");
    const gate = createLockGate();
    const first = confirm(scenario, firstAdmin, firstTarget, firstReview.preview, gate);
    let second: Promise<AdminDeletionOutcome> | undefined;
    try {
      await gate.reached;
      second = confirm(scenario, secondAdmin, secondTarget, secondReview.preview);
      await fixture.waitForBlockedTransactions();
    } finally {
      gate.release();
    }
    scenario.setValue("adminDeletionFirst", await first);
    scenario.setValue("adminDeletionSecond", await second);
  }
);

const outcomeOf = (scenario: Scenario, key = OUTCOME_KEY) => scenario.getValue<Outcome>(key)!;
const reasonOf = (outcome: Outcome) => (outcome.ok ? "succeeded" : outcome.reason);

Then("the admin deletion succeeded", async ({ scenario }) => {
  expect(reasonOf(outcomeOf(scenario))).toBe("succeeded");
});
Then("the admin deletion was refused as {string}", async ({ scenario }, reason: string) => {
  expect(reasonOf(outcomeOf(scenario))).toBe(reason);
});
Then("the first admin deletion succeeded", async ({ scenario }) => {
  expect(reasonOf(outcomeOf(scenario, "adminDeletionFirst"))).toBe("succeeded");
});
Then("the second admin deletion was refused as {string}", async ({ scenario }, reason: string) => {
  expect(reasonOf(outcomeOf(scenario, "adminDeletionSecond"))).toBe(reason);
});
Then(
  "the refusal carries a new review with {int} passing on and {int} deleted",
  async ({ scenario }, passing: number, deleted: number) => {
    const refused = outcomeOf(scenario);
    if (refused.ok || !refused.preview) throw new Error("The refusal carries no review.");
    expect(refused.preview).toMatchObject({ transferredTripCount: passing, deletedTripCount: deleted });
    expect(refused.preview.fingerprint).not.toBe(scenario.getValue<AdminDeletionPreview>(REVIEW_KEY)!.fingerprint);
  }
);
Then("the admin deletion removed the account of {word}", async ({ scenario }, user: string) => {
  expect(await fixtureOf(scenario).accountExists(user)).toBe(false);
});
Then("the admin deletion kept the account of {word}", async ({ scenario }, user: string) => {
  expect(await fixtureOf(scenario).accountExists(user)).toBe(true);
});
Then("trip {word} was passed to {string}", async ({ scenario }, trip: string, heir: string) => {
  const fixture = fixtureOf(scenario);
  const lowerOf = /^the lower ID of (\w+) and (\w+)$/.exec(heir);
  const heirKey = lowerOf ? fixture.lowerIdKey(lowerOf[1], lowerOf[2]) : heir;
  expect(await fixture.tripOwner(trip)).toBe(fixture.userId(heirKey));
  expect(await fixture.membershipRole(trip, heirKey)).toEqual({ role: "manager", isCreator: true });
  expect(await fixture.creatorCount(trip)).toBe(1);
});
Then("trip {word} was removed", async ({ scenario }, trip: string) => {
  expect(await fixtureOf(scenario).tripExists(trip)).toBe(false);
});
Then("trip {word} is still owned by {word}", async ({ scenario }, trip: string, owner: string) => {
  const fixture = fixtureOf(scenario);
  expect(await fixture.tripOwner(trip)).toBe(fixture.userId(owner));
});
Then("exactly {int} completed admin remains", async ({ scenario }, count: number) => {
  expect(await fixtureOf(scenario).completedAdminCount()).toBe(count);
});
