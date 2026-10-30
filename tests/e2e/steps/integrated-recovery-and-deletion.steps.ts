import { expect, type BrowserContext, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { users } from "../../../src/db/schema";
import { CredentialAuthorizationPurpose, UserRole } from "../../../src/data/types";
import {
  issueCredentialAuthorization,
  type CredentialAuthorizationDatabase,
} from "../../../src/lib/credential-authorizations";
import { After, Given, Then } from "../fixtures";
import { withE2EDb } from "../e2e-db";
import { openCredentialLink, recipientContext } from "../onboarding-browser";
import type { ScenarioFixtureContext, ScenarioUserRecord } from "../scenario-fixture";

type Scenario = ScenarioFixtureContext;

const SESSION_KEY = "integratedLiveSession";
const ORIGIN = `http://localhost:${process.env.PORT ?? "3001"}`;

interface LiveSession {
  context: BrowserContext;
  page: Page;
}
// Shape written by seedOwnedTrip in admin-account-deletion.steps.ts; only read here.
interface SeededAccount {
  owner: ScenarioUserRecord;
  trip: { id: string; name: string };
  members: { user: ScenarioUserRecord }[];
}

const appMember = (scenario: Scenario) => scenario.getValue<ScenarioUserRecord>("appMember")!;
const seeded = (scenario: Scenario) => scenario.getValue<SeededAccount>("adminDeletionSeeded");
const database = (db: unknown) => db as CredentialAuthorizationDatabase;

async function startLiveSession(page: Page, scenario: Scenario, user: ScenarioUserRecord) {
  const context = await recipientContext(page);
  const memberPage = await context.newPage();
  await scenario.signInAsUser(memberPage, user.username);
  scenario.setValue<LiveSession>(SESSION_KEY, { context, page: memberPage });
}

Given("the other member holds a live session in a second browser context", async ({ page, scenario }) => {
  await startLiveSession(page, scenario, appMember(scenario));
});

Given("the account owner holds a live session in a second browser context", async ({ page, scenario }) => {
  await startLiveSession(page, scenario, seeded(scenario)!.owner);
});

After(async ({ scenario }) => {
  await scenario
    .getValue<LiveSession>(SESSION_KEY)
    ?.context.close()
    .catch(() => undefined);
});

Given("the account owner has an outstanding reset link and recovery link", async ({ scenario }) => {
  const actor = await scenario.ensureCurrentUser();
  const { owner } = seeded(scenario)!;
  await withE2EDb(async (db) => {
    // Recovery links exist only for admins.
    await db.update(users).set({ role: UserRole.Admin }).where(eq(users.id, owner.id));
    const reset = await issueCredentialAuthorization(
      database(db),
      { kind: "admin", actorUserId: actor.id },
      { userId: owner.id, purpose: CredentialAuthorizationPurpose.Reset }
    );
    if (!reset.ok) throw new Error(`Reset issuance failed: ${reset.reason}`);
    const recovery = await issueCredentialAuthorization(
      database(db),
      { kind: "trusted-operator" },
      { userId: owner.id, purpose: CredentialAuthorizationPurpose.Recovery }
    );
    if (!recovery.ok) throw new Error(`Recovery issuance failed: ${recovery.reason}`);
    scenario.setValue("siblingResetToken", reset.token);
    scenario.setValue("resetRecoveryToken", recovery.token);
  });
});

async function expectSignInRedirect(scenario: Scenario) {
  const { page } = scenario.getValue<LiveSession>(SESSION_KEY)!;
  await page.goto("/trips");
  await expect(page).toHaveURL(/\/sign-in/);
}
Then("the live member session reaches sign-in", async ({ scenario }) => expectSignInRedirect(scenario));
Then("the live member session is refused", async ({ scenario }) => expectSignInRedirect(scenario));

Then("the other member's authenticator is still enrolled", async ({ scenario }) => {
  const [row] = await withE2EDb((db) =>
    db
      .select({ totpSecret: users.totpSecret, mfaEnabledAt: users.mfaEnabledAt })
      .from(users)
      .where(eq(users.id, appMember(scenario).id))
  );
  expect(row.totpSecret).not.toBeNull();
  expect(row.mfaEnabledAt).not.toBeNull();
});

async function expectUnavailable(page: Page, scenario: Scenario, path: string, tokenKey: string, heading: string) {
  const context = await recipientContext(page);
  try {
    const linkPage = await context.newPage();
    await openCredentialLink(
      linkPage,
      `${ORIGIN}${path}?token=${encodeURIComponent(scenario.getValue<string>(tokenKey)!)}`
    );
    await expect(linkPage.getByRole("heading", { name: heading })).toBeVisible();
  } finally {
    await context.close();
  }
}

Then("the recovery link page is unavailable", async ({ page, scenario }) => {
  await expectUnavailable(page, scenario, "/account-recovery", "resetRecoveryToken", "Recovery link unavailable");
});
Then("the reset link page is unavailable", async ({ page, scenario }) => {
  await expectUnavailable(page, scenario, "/account-reset/open", "siblingResetToken", "Reset link unavailable");
});

// ── Privacy: scan what an admin can read, and report only the leaked category ───────────────────────────────────
const tokenOf = (url: string | undefined) => (url ? (new URL(url).searchParams.get("token") ?? undefined) : undefined);
const present = (values: (string | undefined)[]) => values.filter((value): value is string => Boolean(value));

function leakedCategories(scenario: Scenario, markup: string): string[] {
  const account = seeded(scenario);
  const probes: Record<string, string[]> = {
    token: present([
      scenario.getValue<string>("siblingResetToken"),
      scenario.getValue<string>("resetRecoveryToken"),
      tokenOf(scenario.getValue<string>("resetUrl")),
      tokenOf(scenario.getValue<string>("recoveryUrl")),
    ]),
    password: present([process.env.E2E_PASSWORD, "replacement-password-1"]),
    "authenticator key": present([
      scenario.getValue<string>("resetMfaSecret"),
      scenario.getValue<string>("recoverySecret"),
    ]),
    "trip name": present([account?.trip.name, account?.trip.id]),
    "collaborator detail": account ? account.members.flatMap(({ user }) => [user.id, user.name, user.username]) : [],
  };
  const leaked = Object.entries(probes)
    .filter(([, values]) => values.some((value) => markup.includes(value)))
    .map(([category]) => category);
  if (/[?&]token=|\/account-(reset|recovery)/.test(markup)) leaked.push("credential URL");
  return leaked;
}

Then("the admin Activity page exposes no credentials or private trip detail", async ({ page, scenario }) => {
  const admin = await scenario.ensureCurrentUser();
  const context = await recipientContext(page);
  try {
    const adminPage = await context.newPage();
    await scenario.signInAsUser(adminPage, admin.username);
    await adminPage.goto("/admin/activity");
    await expect(adminPage.getByRole("region", { name: "Activity table" })).toBeVisible();
    // Events land just after their responses, so wait for the flow's own rows before scanning.
    const target = seeded(scenario)?.owner ?? appMember(scenario);
    await expect(async () => {
      await adminPage.reload();
      await expect(adminPage.getByRole("row").filter({ hasText: target.username }).first()).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 15_000 });
    const leaked = leakedCategories(scenario, await adminPage.content());
    expect(leaked, `Activity page leaked: ${leaked.join(", ")}`).toEqual([]);
  } finally {
    await context.close();
  }
});
