import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { expect, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { credentialAuthorizations, mfaRecoveryCodes, trustedDevices, users } from "../../../src/db/schema";
import { CredentialAuthorizationPurpose } from "../../../src/data/types";
import { issueAdminRecovery } from "../../../src/lib/admin-recovery-issuance";
import {
  issueCredentialAuthorization,
  validateCredentialAuthorization,
  type CredentialAuthorizationDatabase,
} from "../../../src/lib/credential-authorizations";
import { decryptField, encryptField } from "../../../src/lib/field-encryption";
import { completePasswordReset } from "../../../src/lib/password-reset";
import { Given, When, Then } from "../fixtures";
import type { ScenarioFixtureContext, ScenarioUserRecord } from "../scenario-fixture";
import { withE2EDb } from "../e2e-db";

type Scenario = Pick<ScenarioFixtureContext, "getValue" | "setValue" | "ensureCurrentUser" | "signOut">;

const OLD_SECRET = new Secret({ size: 20 }).base32;
const NEW_PASSWORD = "replacement-password-1";
const ORIGIN = `http://localhost:${process.env.PORT ?? "3001"}`;
const member = (scenario: Scenario) => scenario.getValue<ScenarioUserRecord>("appMember")!;
const database = (db: unknown) => db as CredentialAuthorizationDatabase;
const currentCode = (secret: string) =>
  new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
// The step after "now": completion's code is already spent for this account, and replays are rejected.
const nextCode = (secret: string) =>
  new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: Date.now() + 30_000 });

async function memberRow(scenario: Scenario) {
  const [row] = await withE2EDb((db) =>
    db
      .select({
        passwordHash: users.passwordHash,
        totpSecret: users.totpSecret,
        pending: users.totpPendingSecret,
        mfaEnabledAt: users.mfaEnabledAt,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, member(scenario).id))
  );
  return row;
}
async function setupKey(page: Page): Promise<string> {
  const key = await page.getByTestId("recovery-setup-key").textContent();
  if (!key) throw new Error("Recovery setup key missing.");
  return key.trim();
}
async function activityRows(scenario: Scenario) {
  return withE2EDb(
    (db) =>
      db.execute(
        sql`select type, actor_id, actor_username, target_id, target_username from activity_events where actor_id = ${member(scenario).id} or target_id = ${member(scenario).id}`
      ) as unknown as Promise<Record<string, unknown>[]>
  );
}
async function issueRecovery(scenario: Scenario) {
  const url = await withE2EDb(async (db) => {
    const outcome = await issueAdminRecovery(
      database(db),
      { kind: "trusted-operator" },
      { username: member(scenario).username, origin: ORIGIN }
    );
    if (!outcome.ok) throw new Error(`Recovery issuance failed: ${outcome.reason}`);
    return outcome.url;
  });
  scenario.setValue("recoveryUrl", url);
}
async function submitRecovery(page: Page, password: string, code: string) {
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel("Code from your app").fill(code);
  await page.getByRole("button", { name: "Recover account" }).click();
}

Given("the other member is an admin with MFA, a trusted device and a reset link", async ({ scenario }) => {
  const actor = await scenario.ensureCurrentUser();
  const target = member(scenario);
  await withE2EDb(async (db) => {
    await db
      .update(users)
      .set({ role: "admin", totpSecret: encryptField(OLD_SECRET), mfaEnabledAt: new Date() })
      .where(eq(users.id, target.id));
    await db.insert(trustedDevices).values({
      userId: target.id,
      tokenHash: `recovery-device-${target.id}`,
      label: "Test browser",
      sessionVersion: 0,
    });
    await db.insert(mfaRecoveryCodes).values({ userId: target.id, codeHash: `old-code-${target.id}` });
    const reset = await issueCredentialAuthorization(
      database(db),
      { kind: "admin", actorUserId: actor.id },
      { userId: target.id, purpose: CredentialAuthorizationPurpose.Reset }
    );
    if (!reset.ok) throw new Error(`Reset issuance failed: ${reset.reason}`);
    scenario.setValue("siblingResetToken", reset.token);
  });
  scenario.setValue("oldTotpCipher", (await memberRow(scenario)).totpSecret);
});

When("the operator issues a recovery link for the other member", async ({ scenario }) => {
  await issueRecovery(scenario);
});

When("the operator replaces the recovery link", async ({ scenario }) => {
  await issueRecovery(scenario);
});

When("I open the recovery link as the recipient", async ({ page, scenario }) => {
  scenario.signOut();
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto(scenario.getValue<string>("recoveryUrl")!);
  await expect(page).toHaveURL(/\/account-recovery$/);
});

Then("the recovery form shows a new authenticator key", async ({ page, scenario }) => {
  await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
  const key = await setupKey(page);
  expect(key).toMatch(/^[A-Z2-7]+$/);
  expect(key).not.toBe(OLD_SECRET);
  scenario.setValue("recoverySecret", key);
});

Then("reloading shows the same authenticator key", async ({ page, scenario }) => {
  await page.reload();
  expect(await setupKey(page)).toBe(scenario.getValue<string>("recoverySecret"));
});

When(
  "I complete recovery with password {string} and the correct authenticator code",
  async ({ page, scenario }, password: string) => {
    await submitRecovery(page, password, currentCode(scenario.getValue<string>("recoverySecret")!));
  }
);

When("I submit recovery with password {string} and code {string}", async ({ page }, password: string, code: string) => {
  await submitRecovery(page, password, code);
});

Then("I see ten recovery codes once", async ({ page }) => {
  const heading = page.getByRole("heading", { name: "Save your recovery codes" });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  await expect(page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem")).toHaveCount(10);
});

Then("reloading does not show the recovery codes again", async ({ page }) => {
  await page.reload();
  await expect(page.getByRole("heading", { name: "Recovery link unavailable" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Recovery codes" })).toHaveCount(0);
});

When("I acknowledge the recovery codes", async ({ page }) => {
  await page.getByRole("button", { name: "I saved these" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});

Then("the other member's credentials are fully replaced", async ({ scenario }) => {
  const row = await memberRow(scenario);
  expect(await bcrypt.compare(NEW_PASSWORD, row.passwordHash!)).toBe(true);
  expect(await bcrypt.compare(process.env.E2E_PASSWORD!, row.passwordHash!)).toBe(false);
  expect(row.totpSecret).not.toBe(scenario.getValue<string>("oldTotpCipher"));
  expect(decryptField(row.totpSecret!)).toBe(scenario.getValue<string>("recoverySecret"));
  expect(row.pending).toBeNull();
  expect(row.mfaEnabledAt).not.toBeNull();
  expect(row.sessionVersion).toBe(1);
  await withE2EDb(async (db) => {
    expect(
      await db
        .select()
        .from(trustedDevices)
        .where(eq(trustedDevices.userId, member(scenario).id))
    ).toHaveLength(0);
    const codes = await db
      .select()
      .from(mfaRecoveryCodes)
      .where(eq(mfaRecoveryCodes.userId, member(scenario).id));
    expect(codes).toHaveLength(10);
    expect(codes.some((code) => code.codeHash.startsWith("old-code-"))).toBe(false);
    const sibling = await validateCredentialAuthorization(database(db), {
      token: scenario.getValue<string>("siblingResetToken")!,
      purpose: CredentialAuthorizationPurpose.Reset,
    });
    expect(sibling.ok).toBe(false);
    const token = new URL(scenario.getValue<string>("recoveryUrl")!).searchParams.get("token")!;
    const replay = await validateCredentialAuthorization(database(db), {
      token,
      purpose: CredentialAuthorizationPurpose.Recovery,
    });
    expect(replay.ok).toBe(false);
  });
});

Then("the other member's credentials are unchanged", async ({ scenario }) => {
  const row = await memberRow(scenario);
  expect(await bcrypt.compare(process.env.E2E_PASSWORD!, row.passwordHash!)).toBe(true);
  expect(row.totpSecret).toBe(scenario.getValue<string>("oldTotpCipher"));
  expect(row.pending).toBeNull();
  expect(row.sessionVersion).toBe(0);
  await withE2EDb(async (db) => {
    expect(
      await db
        .select()
        .from(trustedDevices)
        .where(eq(trustedDevices.userId, member(scenario).id))
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(mfaRecoveryCodes)
        .where(eq(mfaRecoveryCodes.userId, member(scenario).id))
    ).toHaveLength(1);
  });
  expect((await activityRows(scenario)).some((event) => event.type === "admin_recovery_completed")).toBe(false);
});

Then("the other member's reset link still works", async ({ scenario }) => {
  const result = await withE2EDb((db) =>
    validateCredentialAuthorization(database(db), {
      token: scenario.getValue<string>("siblingResetToken")!,
      purpose: CredentialAuthorizationPurpose.Reset,
    })
  );
  expect(result.ok).toBe(true);
});

When("the recovery link expires", async ({ scenario }) => {
  await withE2EDb((db) =>
    db
      .update(credentialAuthorizations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(credentialAuthorizations.userId, member(scenario).id))
  );
});

When("a password reset completes for the other member", async ({ scenario }) => {
  const actor = await scenario.ensureCurrentUser();
  await withE2EDb(async (db) => {
    const issued = await issueCredentialAuthorization(
      database(db),
      { kind: "admin", actorUserId: actor.id },
      { userId: member(scenario).id, purpose: CredentialAuthorizationPurpose.Reset }
    );
    if (!issued.ok) throw new Error(`Reset issuance failed: ${issued.reason}`);
    const result = await completePasswordReset(database(db), { token: issued.token, passwordHash: "competing-hash" });
    expect(result.ok).toBe(true);
  });
});

Then("I see the recovery link unavailable page", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Recovery link unavailable" })).toBeVisible();
});

Then("I see a recovery error {string}", async ({ page }, message: string) => {
  await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
});

Then("the competing reset's password stands and MFA is unchanged", async ({ scenario }) => {
  const row = await memberRow(scenario);
  expect(row.passwordHash).toBe("competing-hash");
  expect(row.totpSecret).toBe(scenario.getValue<string>("oldTotpCipher"));
  expect(row.sessionVersion).toBe(1);
});

When("the other member enters the recovered authenticator code", async ({ page, scenario }) => {
  await page
    .getByRole("textbox", { name: "Authentication code" })
    .fill(nextCode(scenario.getValue<string>("recoverySecret")!));
  await page.getByRole("button", { name: "Verify" }).click();
});

Then("Activity shows operator issuance and secret-free completion for the other member", async ({ scenario }) => {
  await expect
    .poll(async () => (await activityRows(scenario)).map((event) => event.type).sort(), { timeout: 15_000 })
    .toEqual(["admin_recovery_completed", "admin_recovery_link_generated"]);
  const rows = await activityRows(scenario);
  expect(rows.find((event) => event.type === "admin_recovery_link_generated")).toMatchObject({
    actor_id: null,
    actor_username: "Server operator (CLI)",
    target_id: member(scenario).id,
  });
  expect(rows.find((event) => event.type === "admin_recovery_completed")).toMatchObject({
    actor_id: member(scenario).id,
    actor_username: member(scenario).username,
  });
  const token = new URL(scenario.getValue<string>("recoveryUrl")!).searchParams.get("token")!;
  const serialized = JSON.stringify(rows);
  for (const secret of [token, scenario.getValue<string>("recoverySecret")!, NEW_PASSWORD])
    expect(serialized).not.toContain(secret);
});

Then("no immediate two-factor reset command or documentation remains", async () => {
  const root = process.cwd();
  for (const file of ["mfa-reset.ts", "mfa-reset-cli.ts", "mfa-reset.test.ts"])
    expect(existsSync(join(root, "src/db", file))).toBe(false);
  for (const file of ["Dockerfile", "docs/self-hosting.md"])
    expect(readFileSync(join(root, file), "utf8")).not.toContain("mfa-reset");
  expect(readFileSync(join(root, "Dockerfile"), "utf8")).toContain("admin-recovery.mjs");
});
