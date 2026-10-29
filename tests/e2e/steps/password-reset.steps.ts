import bcrypt from "bcryptjs";
import { expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { trustedDevices, users } from "../../../src/db/schema";
import { CredentialAuthorizationPurpose } from "../../../src/data/types";
import {
  issueCredentialAuthorization,
  validateCredentialAuthorization,
  type CredentialAuthorizationDatabase,
} from "../../../src/lib/credential-authorizations";
import { completePasswordReset } from "../../../src/lib/password-reset";
import { lockAppAndUsersForUpdate } from "../../../src/lib/account-lifecycle-locks";
import type { DbTransaction } from "../../../src/lib/server-action-locks";
import { encryptField } from "../../../src/lib/field-encryption";
import { Given, When, Then } from "../fixtures";
import type { ScenarioUserRecord } from "../scenario-fixture";
import { withE2EDb } from "../e2e-db";
import { waitForServerActionResponse } from "../server-action";

const member = (scenario: { getValue<T>(key: string): T | undefined }) =>
  scenario.getValue<ScenarioUserRecord>("appMember")!;

Given("the other member has MFA enabled", async ({ scenario }) => {
  const secret = new Secret({ size: 20 }).base32;
  scenario.setValue("resetMfaSecret", secret);
  await withE2EDb((database) =>
    database
      .update(users)
      .set({ totpSecret: encryptField(secret), mfaEnabledAt: new Date() })
      .where(eq(users.id, member(scenario).id))
  );
});

When("I generate a password reset link for the other member", async ({ page, scenario }) => {
  await page.getByRole("button", { name: `Reset password: ${member(scenario).username}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("dialog").getByRole("button", { name: "Generate link" }).click();
  await response;
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Password reset link ready" })).toBeVisible();
  const url = await dialog.locator("p.select-text").textContent();
  if (!url) throw new Error("Reset link missing.");
  scenario.setValue("resetUrl", url);
});

Then("the other member's original password remains valid", async ({ scenario }) => {
  const [row] = await withE2EDb((database) =>
    database
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, member(scenario).id))
  );
  expect(await bcrypt.compare(process.env.E2E_PASSWORD!, row.passwordHash!)).toBe(true);
});

When("I open the generated password reset link as a recipient", async ({ page, scenario }) => {
  scenario.signOut();
  await page.goto("about:blank");
  await page.context().clearCookies();
  await page.goto(scenario.getValue<string>("resetUrl")!);
  await expect(page).toHaveURL(/\/account-reset$/);
});

When("I complete the password reset with {string}", async ({ page }, password: string) => {
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  const response = waitForServerActionResponse(page, { pathIncludes: "/account-reset", expectedStatus: 303 });
  await page.getByRole("button", { name: "Reset password" }).click();
  await response;
  await expect(page).toHaveURL(/\/sign-in/);
});

Then("the other member's new password is saved and the link is unavailable", async ({ page, scenario }) => {
  const [row] = await withE2EDb((database) =>
    database
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, member(scenario).id))
  );
  expect(await bcrypt.compare("replacement-password-1", row.passwordHash!)).toBe(true);
  await page.goto(scenario.getValue<string>("resetUrl")!);
  await expect(page.getByRole("heading", { name: "Reset link unavailable" })).toBeVisible();
});

When("the reset link is replaced", async ({ scenario }) => {
  const actor = await scenario.ensureCurrentUser();
  await withE2EDb(async (database) => {
    const result = await issueCredentialAuthorization(
      database as unknown as CredentialAuthorizationDatabase,
      { kind: "admin", actorUserId: actor.id },
      { userId: member(scenario).id, purpose: CredentialAuthorizationPurpose.Reset }
    );
    if (!result.ok) throw new Error(`Reset issuance failed: ${result.reason}`);
  });
});

Then("I see the reset link unavailable page", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Reset link unavailable" })).toBeVisible();
});

When("the other member signs in with the new password", async ({ page, scenario }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(member(scenario).username);
  await page.getByLabel("Password", { exact: true }).fill("replacement-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
});

When("the other member enters their authenticator code", async ({ page, scenario }) => {
  const secret = scenario.getValue<string>("resetMfaSecret")!;
  const code = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
  await page.getByRole("textbox", { name: "Authentication code" }).fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
});

When("I submit a cross-origin password reset", async ({ page }) => {
  await page.getByLabel("Password", { exact: true }).fill("replacement-password-1");
  await page.getByLabel("Confirm password").fill("replacement-password-1");
  let status = 0;
  await page.route("**/account-reset", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const request = route.request();
    const response = await page.request.post(request.url(), {
      headers: { ...request.headers(), origin: "https://attacker.example" },
      data: request.postDataBuffer() ?? undefined,
      maxRedirects: 0,
    });
    status = response.status();
    await route.abort();
  });
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect.poll(() => status).toBeGreaterThanOrEqual(400);
  await page.unroute("**/account-reset");
});

When("two reset completions compete for the same account", async ({ scenario }) => {
  const actor = await scenario.ensureCurrentUser();
  const target = member(scenario);
  await withE2EDb(async (database) => {
    await database
      .update(users)
      .set({ totpSecret: "preserved-encrypted-secret", mfaEnabledAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(users.id, target.id));
    const issued = await issueCredentialAuthorization(
      database as unknown as CredentialAuthorizationDatabase,
      { kind: "admin", actorUserId: actor.id },
      { userId: target.id, purpose: CredentialAuthorizationPurpose.Reset }
    );
    if (!issued.ok) throw new Error(`Reset issuance failed: ${issued.reason}`);
    const results = await Promise.all(
      ["first-hash", "second-hash"].map((passwordHash) =>
        completePasswordReset(database as unknown as CredentialAuthorizationDatabase, {
          token: issued.token,
          passwordHash,
        })
      )
    );
    scenario.setValue("resetRaceResults", results);
  });
});

Then("exactly one reset completion succeeds and MFA remains unchanged", async ({ scenario }) => {
  const results = scenario.getValue<{ ok: boolean }[]>("resetRaceResults")!;
  expect(results.filter((result) => result.ok)).toHaveLength(1);
  const [row] = await withE2EDb((database) =>
    database
      .select({
        passwordHash: users.passwordHash,
        totpSecret: users.totpSecret,
        mfaEnabledAt: users.mfaEnabledAt,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, member(scenario).id))
  );
  expect(["first-hash", "second-hash"]).toContain(row.passwordHash);
  expect(row.totpSecret).toBe("preserved-encrypted-secret");
  expect(row.mfaEnabledAt).not.toBeNull();
  expect(row.sessionVersion).toBe(1);
});

Given("the other member has a trusted device and recovery authorization", async ({ scenario }) => {
  const target = member(scenario);
  await withE2EDb(async (database) => {
    await database.update(users).set({ role: "admin" }).where(eq(users.id, target.id));
    await database
      .insert(trustedDevices)
      .values({ userId: target.id, tokenHash: `reset-device-${target.id}`, label: "Test browser", sessionVersion: 0 });
    const recovery = await issueCredentialAuthorization(
      database as unknown as CredentialAuthorizationDatabase,
      { kind: "trusted-operator" },
      { userId: target.id, purpose: CredentialAuthorizationPurpose.Recovery }
    );
    if (!recovery.ok) throw new Error(`Recovery issuance failed: ${recovery.reason}`);
    scenario.setValue("resetRecoveryToken", recovery.token);
  });
});

When("I reset the other member's password through the lifecycle service", async ({ scenario }) => {
  const actor = await scenario.ensureCurrentUser();
  const target = member(scenario);
  await withE2EDb(async (database) => {
    const issued = await issueCredentialAuthorization(
      database as unknown as CredentialAuthorizationDatabase,
      { kind: "admin", actorUserId: actor.id },
      { userId: target.id, purpose: CredentialAuthorizationPurpose.Reset }
    );
    if (!issued.ok) throw new Error(`Reset issuance failed: ${issued.reason}`);
    const result = await completePasswordReset(database as unknown as CredentialAuthorizationDatabase, {
      token: issued.token,
      passwordHash: "replacement-hash",
    });
    expect(result.ok).toBe(true);
  });
});

Then("the trusted device and recovery authorization are revoked", async ({ scenario }) => {
  await withE2EDb(async (database) => {
    expect(
      await database
        .select()
        .from(trustedDevices)
        .where(eq(trustedDevices.userId, member(scenario).id))
    ).toHaveLength(0);
    const recovery = await validateCredentialAuthorization(database as unknown as CredentialAuthorizationDatabase, {
      token: scenario.getValue<string>("resetRecoveryToken")!,
      purpose: CredentialAuthorizationPurpose.Recovery,
    });
    expect(recovery.ok).toBe(false);
  });
});

When("the member's password change races a reset", async ({ page, scenario }) => {
  const actor = await scenario.ensureCurrentUser();
  const target = member(scenario);
  const resetPassword = "race-reset-password";
  const resetHash = await bcrypt.hash(resetPassword, 10);
  await scenario.signInAsUser(page, target.username);
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Account" }).click();
  await page.getByLabel("Current password").fill(process.env.E2E_PASSWORD!);
  await page.getByLabel("New password", { exact: true }).fill("race-profile-password");
  await page.getByLabel("Confirm new password").fill("race-profile-password");

  await withE2EDb(async (database) => {
    const issued = await issueCredentialAuthorization(
      database as unknown as CredentialAuthorizationDatabase,
      { kind: "admin", actorUserId: actor.id },
      { userId: target.id, purpose: CredentialAuthorizationPurpose.Reset }
    );
    if (!issued.ok) throw new Error(`Reset issuance failed: ${issued.reason}`);
    let actionResponse: Promise<unknown> | undefined;
    await database.transaction(async (transaction) => {
      await lockAppAndUsersForUpdate(transaction as unknown as DbTransaction, [target.id]);
      const [connection] = (await transaction.execute(sql`select pg_backend_pid() as pid`)) as unknown as {
        pid: number;
      }[];
      actionResponse = waitForServerActionResponse(page, { pathIncludes: "/profile", timeoutMs: 20_000 });
      await page.getByRole("button", { name: "Update password" }).click();
      await expect
        .poll(
          async () =>
            withE2EDb(async (observer) => {
              const rows = await observer.execute(
                sql`select pid from pg_stat_activity where ${connection.pid} = any(pg_blocking_pids(pid))`
              );
              return rows.length;
            }),
          { timeout: 15_000 }
        )
        .toBeGreaterThan(0);
      const scoped = { transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction) };
      const result = await completePasswordReset(scoped as unknown as CredentialAuthorizationDatabase, {
        token: issued.token,
        passwordHash: resetHash,
      });
      expect(result.ok).toBe(true);
    });
    await actionResponse;
  });
  scenario.setValue("raceResetPassword", resetPassword);
});

Then("the reset password wins and the old session cannot change it", async ({ page, scenario }) => {
  await expect(page.getByText("Session expired. Sign in again.")).toBeVisible();
  const [row] = await withE2EDb((database) =>
    database
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, member(scenario).id))
  );
  expect(await bcrypt.compare(scenario.getValue<string>("raceResetPassword")!, row.passwordHash!)).toBe(true);
  expect(await bcrypt.compare("race-profile-password", row.passwordHash!)).toBe(false);
});
