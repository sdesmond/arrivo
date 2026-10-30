import bcrypt from "bcryptjs";
import { expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { activityEvents, trustedDevices, trips, users } from "../../../src/db/schema";
import { CredentialAuthorizationPurpose } from "../../../src/data/types";
import {
  issueCredentialAuthorization,
  validateCredentialAuthorization,
  type CredentialAuthorizationDatabase,
} from "../../../src/lib/credential-authorizations";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { completePasswordReset } from "../../../src/lib/password-reset";
import { lockAppAndUsersForUpdate } from "../../../src/lib/account-lifecycle-locks";
import type { DbTransaction } from "../../../src/lib/server-action-locks";
import { encryptField } from "../../../src/lib/field-encryption";
import { Given, When, Then } from "../fixtures";
import type { ScenarioUserRecord } from "../scenario-fixture";
import { withE2EDb } from "../e2e-db";
import { waitForServerActionResponse } from "../server-action";

// Bundle the real recovery service for this Node test process; Next's server-only marker has no runtime here.
let recoveryService: Promise<typeof import("../../../src/lib/admin-recovery-completion")> | undefined;
function loadRecoveryService() {
  recoveryService ??= (async () => {
    const outfile = resolve("test-results", `recovery-service-${process.pid}.cjs`);
    await build({
      entryPoints: ["src/lib/admin-recovery-completion.ts"],
      outfile,
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
      plugins: [
        {
          name: "server-only-marker",
          setup(builder) {
            builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "marker", namespace: "empty-marker" }));
            builder.onLoad({ filter: /.*/, namespace: "empty-marker" }, () => ({ contents: "" }));
          },
        },
      ],
    });
    return createRequire(resolve("package.json"))(
      outfile
    ) as typeof import("../../../src/lib/admin-recovery-completion");
  })();
  return recoveryService;
}

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

When("the member's {string} races a reset", async ({ page, scenario }, action: string) => {
  const actor = await scenario.ensureCurrentUser();
  const target = member(scenario);
  const resetHash = await bcrypt.hash("race-reset-password", 10);
  await scenario.signInAsUser(page, target.username);
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Security" }).click();
  const deviceId = randomUUID();
  const tokenHash = createHash("sha256").update(randomUUID()).digest("hex");
  const deviceLabel = "Reset race browser";

  await withE2EDb(async (database) => {
    const [account] = await database
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, target.id));
    await database.insert(trustedDevices).values({
      id: deviceId,
      userId: target.id,
      tokenHash,
      label: deviceLabel,
      sessionVersion: account.sessionVersion,
    });
    // Render the target at the old version before taking the lock.
    await page.reload();
    await page.getByRole("tab", { name: "Security" }).click();
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
      actionResponse = waitForServerActionResponse(page, {
        pathIncludes: "/profile",
        expectedStatus: 303,
        timeoutMs: 20_000,
      });
      await page
        .getByRole("button", {
          name: action === "global sign-out" ? "Sign out all devices" : `Remove ${deviceLabel}`,
          exact: true,
        })
        .click();
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
      // Reuse the selected ID so an unguarded stale delete has an observable effect.
      await transaction.insert(trustedDevices).values({
        id: deviceId,
        userId: target.id,
        tokenHash,
        label: deviceLabel,
        sessionVersion: account.sessionVersion + 1,
      });
    });
    await actionResponse;
    scenario.setValue("securityRaceVersion", account.sessionVersion + 1);
    scenario.setValue("securityRaceDevice", deviceId);
  });
});

Then(
  "fresh authentication survives and the stale browser reaches sign-in without a success notice",
  async ({ page, scenario }) => {
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("status")).not.toBeVisible();
    await withE2EDb(async (database) => {
      const [account] = await database
        .select({ sessionVersion: users.sessionVersion })
        .from(users)
        .where(eq(users.id, member(scenario).id));
      expect(account.sessionVersion).toBe(scenario.getValue<number>("securityRaceVersion"));
      const [device] = await database
        .select()
        .from(trustedDevices)
        .where(eq(trustedDevices.id, scenario.getValue<string>("securityRaceDevice")!));
      expect(device).toMatchObject({ userId: member(scenario).id, sessionVersion: account.sessionVersion });
    });
  }
);

When("the member's self-deletion queues behind {string}", async ({ page, scenario }, completion: string) => {
  const { completeAdminRecovery, startAdminRecoveryEnrollment } = await loadRecoveryService();
  const actor = await scenario.ensureCurrentUser(),
    target = member(scenario);
  const { trip } = await scenario.materialize({ trip: { ownerId: target.id, setCurrent: false } });
  if (!trip) throw new Error("Trip materialization failed.");
  scenario.setValue("deletionRaceTrip", trip.id);
  await withE2EDb(async (database) => {
    if (completion === "recovery") await database.update(users).set({ role: "admin" }).where(eq(users.id, target.id));
    const issued = await issueCredentialAuthorization(
      database as unknown as CredentialAuthorizationDatabase,
      completion === "recovery" ? { kind: "trusted-operator" } : { kind: "admin", actorUserId: actor.id },
      {
        userId: target.id,
        purpose:
          completion === "recovery" ? CredentialAuthorizationPurpose.Recovery : CredentialAuthorizationPurpose.Reset,
      }
    );
    if (!issued.ok) throw new Error("Authorization issuance failed.");
    const enrollment =
      completion === "recovery"
        ? await startAdminRecoveryEnrollment(database as unknown as CredentialAuthorizationDatabase, issued.token)
        : undefined;
    if (enrollment && !enrollment.ok) throw new Error("Recovery enrollment failed.");
    await scenario.signInAsUser(page, target.username);
    await page.goto("/profile");
    await page.getByRole("tab", { name: "Account" }).click();
    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Delete account?" });
    await expect(dialog).toBeVisible();
    const replacementPassword = "race-lifecycle-password";
    const passwordHash = await bcrypt.hash(replacementPassword, 10);
    let response: Promise<unknown> | undefined;
    await database.transaction(async (transaction) => {
      await lockAppAndUsersForUpdate(transaction as unknown as DbTransaction, [target.id]);
      const [connection] = (await transaction.execute(sql`select pg_backend_pid() as pid`)) as unknown as {
        pid: number;
      }[];
      response = waitForServerActionResponse(page, { pathIncludes: "/profile", expectedStatus: 303, timeoutMs: 20000 });
      await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
      await expect
        .poll(
          async () =>
            withE2EDb(
              async (observer) =>
                (
                  await observer.execute(
                    sql`select pid from pg_stat_activity where ${connection.pid} = any(pg_blocking_pids(pid))`
                  )
                ).length
            ),
          { timeout: 15000 }
        )
        .toBeGreaterThan(0);
      const scoped = {
        transaction: async (run: (value: typeof transaction) => Promise<unknown>) => run(transaction),
      } as unknown as CredentialAuthorizationDatabase;
      const result = enrollment?.ok
        ? await completeAdminRecovery(scoped, {
            token: issued.token,
            passwordHash,
            code: new TOTP({
              secret: Secret.fromBase32(enrollment.secret),
              algorithm: "SHA1",
              digits: 6,
              period: 30,
            }).generate(),
          })
        : await completePasswordReset(scoped, { token: issued.token, passwordHash });
      expect(result.ok).toBe(true);
      await transaction.insert(trustedDevices).values({
        userId: target.id,
        tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
        label: "Post-completion browser",
        sessionVersion: 1,
      });
    });
    await response;
    scenario.setValue("deletionRacePassword", replacementPassword);
  });
});
Then("the account, trip and fresh authentication survive the refused self-deletion", async ({ page, scenario }) => {
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("status")).not.toBeVisible();
  await withE2EDb(async (database) => {
    const target = member(scenario);
    const [account] = await database.select().from(users).where(eq(users.id, target.id));
    expect(account.sessionVersion).toBe(1);
    expect(await bcrypt.compare(scenario.getValue<string>("deletionRacePassword")!, account.passwordHash!)).toBe(true);
    const [trip] = await database
      .select()
      .from(trips)
      .where(eq(trips.id, scenario.getValue<string>("deletionRaceTrip")!));
    expect(trip.ownerId).toBe(target.id);
    const devices = await database.select().from(trustedDevices).where(eq(trustedDevices.userId, target.id));
    expect(devices).toHaveLength(1);
    expect(devices[0].sessionVersion).toBe(1);
    const events = await database.select().from(activityEvents).where(eq(activityEvents.actorId, target.id));
    expect(events.some((event) => event.type === "account_deleted")).toBe(false);
  });
});
