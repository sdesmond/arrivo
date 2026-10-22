import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";
import { mfaRecoveryCodes, users } from "../../../src/db/schema";
import { encryptField } from "../../../src/lib/field-encryption";
import { withE2EDb } from "../e2e-db";
import { Given, When, Then } from "../fixtures";

const TOTP_SECRET_KEY = "mfa:totp-secret";
const RECOVERY_CODE_KEY = "mfa:recovery-code";
const STEP_MS = 30_000;

// Also uses "I open the Security section" and "I should see the sign-in notice" from profile.steps.ts.

// The step after "now": the server accepts one step of drift, and a code from the step enrollment just used
// would be rejected as a replay.
function nextCode(secret: string): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({
    timestamp: Date.now() + STEP_MS,
  });
}

function totpSecret(scenario: { getValue<T>(key: string): T | undefined }): string {
  const secret = scenario.getValue<string>(TOTP_SECRET_KEY);
  if (!secret) throw new Error("No TOTP secret recorded for this scenario.");
  return secret;
}

async function submitCode(page: Page, code: string) {
  await page.getByRole("textbox", { name: /Authentication code|Recovery code/ }).fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

Given("my account has two-factor authentication on", async ({ scenario }) => {
  const user = await scenario.ensureCurrentUser();
  const secret = new Secret({ size: 20 }).base32;
  const recoveryCode = "e2eaa-bbbbb";

  await withE2EDb(async (db) => {
    await db
      .update(users)
      .set({ totpSecret: encryptField(secret), mfaEnabledAt: new Date() })
      .where(eq(users.id, user.id));
    // Same normalization + SHA-256 as hashRecoveryCode() in src/lib/mfa.ts (server-only, so not importable here).
    const codeHash = createHash("sha256")
      .update(recoveryCode.replace(/[^a-z0-9]/g, ""))
      .digest("hex");
    await db.insert(mfaRecoveryCodes).values({ userId: user.id, codeHash });
  });

  scenario.setValue(TOTP_SECRET_KEY, secret);
  scenario.setValue(RECOVERY_CODE_KEY, recoveryCode);
});

When("I open my profile's Security section", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Security" }).click();
  await expect(page.getByRole("tabpanel", { name: "Security" })).toBeVisible();
});

When("I set up two-factor authentication with my authenticator app", async ({ page, scenario }) => {
  await page.getByRole("button", { name: "Set up two-factor authentication" }).click();
  const dialog = page.getByRole("dialog", { name: "Set up two-factor authentication" });
  await expect(dialog.getByAltText("QR code for your authenticator app")).toBeVisible();

  const secret = (await dialog.getByTestId("mfa-setup-key").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  scenario.setValue(TOTP_SECRET_KEY, secret);

  const now = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
  await dialog.getByLabel("Code from your app").fill(now);
  await dialog.getByRole("button", { name: "Turn on" }).click();
});

Then("I should see {int} recovery codes", async ({ page }, count: number) => {
  const list = page.getByRole("list", { name: "Recovery codes" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(count);
});

When("I confirm I saved my recovery codes", async ({ page, scenario }) => {
  await page.getByRole("button", { name: "I saved these" }).click();
  await page.waitForURL("**/sign-in?notice=*");
  scenario.signOut();
});

When("I sign in with my password", async ({ page, scenario }) => {
  const user = await scenario.ensureCurrentUser();
  if (!page.url().includes("/sign-in")) await page.goto("/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill(user.email);
  await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
});

Then("I should be asked for an authentication code", async ({ page }) => {
  await expect(page.getByRole("textbox", { name: "Authentication code" })).toBeFocused();
});

When("I enter the next code from my authenticator app", async ({ page, scenario }) => {
  await expect(page.getByRole("textbox", { name: "Authentication code" })).toBeVisible();
  await submitCode(page, nextCode(totpSecret(scenario)));
});

When(
  "I enter the next code from my authenticator app and ask not to be asked again on this browser",
  async ({ page, scenario }) => {
    await expect(page.getByRole("textbox", { name: "Authentication code" })).toBeVisible();
    await page.getByRole("checkbox", { name: "Don't ask for a code on this browser for 30 days" }).check();
    await submitCode(page, nextCode(totpSecret(scenario)));
  }
);

When("I remove this browser", async ({ page, scenario }) => {
  // Removing the browser you're on signs it out straight away.
  await page.getByRole("button", { name: /^Remove .* \(this browser\)$/ }).click();
  await page.waitForURL("**/sign-in");
  scenario.signOut();
});

When("I enter a recovery code", async ({ page, scenario }) => {
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await submitCode(page, scenario.getValue<string>(RECOVERY_CODE_KEY)!);
});

Then("I should see the two-factor error {string}", async ({ page }, text: string) => {
  await expect(page.locator("#mfa-error")).toHaveText(text);
  await expect(page).toHaveURL(/\/sign-in/);
});

When("I turn off two-factor authentication with my password and a code", async ({ page, scenario }) => {
  await page.getByRole("button", { name: "Turn off two-factor authentication" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Current password").fill(process.env.E2E_PASSWORD!);
  // The sign-in above already spent the newest authenticator step, so confirm with the unused recovery code.
  await dialog.getByLabel("Code from your app or a recovery code").fill(scenario.getValue<string>(RECOVERY_CODE_KEY)!);
  await dialog.getByRole("button", { name: "Turn off" }).click();
  await page.waitForURL("**/sign-in?notice=*");
  scenario.signOut();
});
