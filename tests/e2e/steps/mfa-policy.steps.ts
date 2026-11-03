import { expect, type Page, type Request } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { Given, When, Then, type PolicyAppRegistry } from "../fixtures";
import { cloneSecurityPolicyUserMother, type SecurityPolicyUser } from "../security-policy-fixture";
import { waitForServerActionResponse } from "../server-action";

const secrets = new WeakMap<PolicyAppRegistry, string>();
const recoveryCodes = new WeakMap<PolicyAppRegistry, string>();
const privateRequests = new WeakMap<PolicyAppRegistry, { action: string; body: string }>();

Then("overlapping instance enable and member disable preserve enrolled MFA", async ({ policyApp }) => {
  const page = policyApp.browser("new");
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Security" }).click();
  await page.getByRole("button", { name: "Turn off two-factor authentication", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Current password").fill(account(policyApp).password!);
  await dialog.getByLabel("Code from your app or a recovery code").fill(recoveryCodes.get(policyApp)!);
  const client = policyApp.app.client;
  const memberId = account(policyApp).id;
  const snapshot = async () => ({
    account: await client`select totp_secret, totp_pending_secret, totp_last_step, mfa_enabled_at, session_version
      from users where id = ${memberId}`,
    codes: await client`select id, code_hash, used_at from mfa_recovery_codes where user_id = ${memberId} order by id`,
    devices: await client`select id, token_hash, session_version, mfa_remembered_until from trusted_devices
      where user_id = ${memberId} order by id`,
  });
  const before = await snapshot();
  let releaseLock!: () => void;
  let signalLocked!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    signalLocked = resolve;
  });
  const holding = client.begin(async (transaction) => {
    await transaction`select id from app_state where id = true for update`;
    signalLocked();
    await release;
  });
  await locked;
  const waiting = async () => {
    const [row] = await client`select count(*)::int as count from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock' and query like '%app_state%'`;
    return row.count as number;
  };
  let enableFinished = false;
  let disableFinished = false;
  const enabling = toggle(policyApp, true, true).then(() => {
    enableFinished = true;
  });
  let disabling: Promise<unknown> | undefined;
  try {
    await expect.poll(waiting, { timeout: 30_000 }).toBe(1);
    disabling = waitForServerActionResponse(page, { pathIncludes: "/profile", timeoutMs: 120_000 }).then(() => {
      disableFinished = true;
    });
    await dialog.getByRole("button", { name: "Turn off", exact: true }).click();
    await expect.poll(waiting, { timeout: 30_000 }).toBe(2);
    expect(enableFinished).toBe(false);
    expect(disableFinished).toBe(false);
  } finally {
    releaseLock();
    await holding;
    await Promise.all([enabling, disabling]);
  }
  await expect(dialog.getByRole("alert")).toHaveText("Two-factor authentication is required for your account.");
  const [policy] = await client`select mfa_required from app_state where id = true`;
  expect(policy.mfa_required).toBe(true);
  expect(await snapshot()).toEqual(before);
});

function account(registry: PolicyAppRegistry, role = "member"): SecurityPolicyUser {
  const user = registry.users.get(role);
  if (!user) throw new Error("Missing scenario account.");
  return user;
}

async function passwordSignIn(page: Page, user: SecurityPolicyUser) {
  await page.goto("/sign-in");
  await page.getByLabel("Username", { exact: true }).fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function toggle(registry: PolicyAppRegistry, instance: boolean, enabled: boolean) {
  const page = registry.browser("admin");
  const path = instance ? "/admin/security" : "/admin/users";
  await page.goto(path);
  const name = instance ? "Require two-factor authentication for everyone" : "Require 2FA";
  const scope = instance
    ? page
    : page.getByRole("listitem").filter({ has: page.getByText(account(registry).username, { exact: true }) });
  const control = scope.getByRole("switch", { name, exact: true });
  await expect(control).toBeVisible();
  if ((await control.isChecked()) === enabled) return;
  const capture = (request: Request) => {
    const action = request.headers()["next-action"];
    if (action && request.method() === "POST")
      privateRequests.set(registry, { action, body: request.postData() ?? "" });
  };
  page.on("request", capture);
  const response = waitForServerActionResponse(page, { pathIncludes: path, timeoutMs: 120_000 });
  await control.click();
  await response;
  page.off("request", capture);
  await expect(control).toBeChecked({ checked: enabled });
}

Given("an isolated MFA policy app", async ({ policyApp }) => {
  await policyApp.start();
  for (const role of ["admin", "member"] as const) {
    policyApp.users.set(role, await policyApp.app.seedUser(cloneSecurityPolicyUserMother(role)));
  }
});

When("the admin requires MFA for everyone", async ({ policyApp }) => toggle(policyApp, true, true));
When("the admin requires MFA for the policy member", async ({ policyApp }) => toggle(policyApp, false, true));
When("the admin removes the policy member MFA requirement", async ({ policyApp }) => toggle(policyApp, false, false));
When("the admin removes the instance MFA requirement", async ({ policyApp }) => toggle(policyApp, true, false));

Then("individual MFA switches inherit the instance requirement", async ({ policyApp }) => {
  const page = policyApp.browser("admin");
  await page.goto("/admin/users");
  const cards = page.getByRole("list", { name: "App users" });
  const controls = cards.getByRole("switch", { name: "Require 2FA", exact: true });
  await expect(controls).toHaveCount(policyApp.users.size);
  for (const control of await controls.all()) {
    await expect(control).toBeChecked();
    await expect(control).toBeDisabled();
  }
  const trigger = cards.getByLabel("2FA requirement managed by Security").first();
  await trigger.focus();
  await expect(page.getByRole("tooltip")).toHaveText("2FA is turned on for everyone in the Security tab");
  await page.keyboard.press("Escape");
  const [member] = await policyApp.app.client`select mfa_required from users where id = ${account(policyApp).id}`;
  expect(member.mfa_required).toBe(true);
});

Then("all individual MFA requirements are off and editable", async ({ policyApp }) => {
  const page = policyApp.browser("admin");
  await page.goto("/admin/users");
  const controls = page
    .getByRole("list", { name: "App users" })
    .getByRole("switch", { name: "Require 2FA", exact: true });
  await expect(controls).toHaveCount(policyApp.users.size);
  for (const control of await controls.all()) {
    await expect(control).not.toBeChecked();
    await expect(control).toBeEnabled();
  }
  const enabled = await policyApp.app.client`select id from users where mfa_required = true`;
  expect(enabled).toHaveLength(0);
});

When(
  "the {string} browser signs in as the unenrolled policy {word}",
  async ({ policyApp }, label: string, role: string) => {
    const page = await policyApp.openBrowser(label);
    await passwordSignIn(page, account(policyApp, role));
    await expect(page).toHaveURL(/\/mfa-enrollment$/, { timeout: 120_000 });
  }
);

Then("the {string} browser still has private app access", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  await page.goto("/trips");
  await expect(page).toHaveURL(/\/trips$/, { timeout: 120_000 });
});

Then(
  "the {string} browser must enroll before accessing private pages or endpoints",
  async ({ policyApp }, label: string) => {
    const page = policyApp.browser(label);
    for (const path of ["/trips", "/profile", "/packing", "/travel-history"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/mfa-enrollment$/);
    }
    for (const path of [
      "/api/storage/blocked",
      "/api/users/me/events",
      "/api/users/me/app-role",
      "/api/trips/00000000-0000-0000-0000-000000000000/events",
    ]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.headers().location).toContain("/mfa-enrollment");
      expect(response.headers()["content-type"] ?? "").not.toContain("text/event-stream");
    }
  }
);

Then("the {string} browser cannot replay a private policy action", async ({ policyApp }, label: string) => {
  const captured = privateRequests.get(policyApp);
  if (!captured) throw new Error("Missing action request.");
  const page = policyApp.browser(label);
  const response = await page.request.post("/admin/security", {
    headers: {
      "next-action": captured.action,
      "content-type": "text/plain;charset=UTF-8",
      origin: policyApp.app.baseURL!,
    },
    data: captured.body,
    maxRedirects: 0,
  });
  expect(response.headers()["x-action-redirect"]).toContain("/mfa-enrollment");
  const [row] = await policyApp.app.client`select mfa_required from app_state where id = true`;
  expect(row.mfa_required).toBe(true);
});

When("the {string} browser completes required enrollment", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  await page.getByRole("button", { name: "Set up two-factor authentication", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Set up two-factor authentication" });
  const secret = (await dialog.getByTestId("mfa-setup-key").textContent())!.trim();
  secrets.set(policyApp, secret);
  const code = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
  await dialog.getByLabel("Code from your app").fill(code);
  const response = waitForServerActionResponse(page, { pathIncludes: "/mfa-enrollment" });
  await dialog.getByRole("button", { name: "Turn on", exact: true }).click();
  await response;
});

Then(
  "the {string} browser must acknowledge recovery codes before fresh sign-in",
  async ({ policyApp }, label: string) => {
    const page = policyApp.browser(label);
    const list = page.getByRole("list", { name: "Recovery codes" });
    await expect(list.getByRole("listitem")).toHaveCount(10);
    recoveryCodes.set(policyApp, (await list.getByRole("listitem").first().textContent())!.trim());
    await page.keyboard.press("Escape");
    await expect(list).toBeVisible();
    await expect(page).toHaveURL(/\/mfa-enrollment$/);
    await page.getByRole("button", { name: "I saved these" }).click();
    await expect(page).toHaveURL(/\/sign-in\?notice=mfa-enabled$/);
  }
);

When("the {string} browser signs in with a code and remembers this browser", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  await passwordSignIn(page, account(policyApp));
  const code = new TOTP({ secret: Secret.fromBase32(secrets.get(policyApp)!), digits: 6, period: 30 }).generate({
    timestamp: Date.now() + 30_000,
  });
  await page.getByRole("textbox", { name: "Authentication code", exact: true }).fill(code);
  await page.getByRole("checkbox", { name: "Don't ask for a code on this browser for 30 days" }).check();
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page).toHaveURL(/\/trips$/);
});

Then("the {string} browser cannot disable required MFA", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Security" }).click();
  await expect(page.getByRole("button", { name: "Turn off two-factor authentication", exact: true })).toBeDisabled();
  await expect(page.getByText("Two-factor authentication is required for your account.")).toBeVisible();
});

When("the {string} browser signs out and signs in again", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await passwordSignIn(page, account(policyApp));
  await expect(page).toHaveURL(/\/trips$/);
});

When("a fresh browser signs in using a mandatory MFA recovery code", async ({ policyApp }) => {
  const page = await policyApp.openBrowser("recovery");
  await passwordSignIn(page, account(policyApp));
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await page.getByRole("textbox", { name: "Recovery code", exact: true }).fill(recoveryCodes.get(policyApp)!);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page).toHaveURL(/\/trips$/);
});

Then("that recovery code cannot be reused", async ({ policyApp }) => {
  const page = await policyApp.openBrowser("replay");
  await passwordSignIn(page, account(policyApp));
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await page.getByRole("textbox", { name: "Recovery code", exact: true }).fill(recoveryCodes.get(policyApp)!);
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.locator("#mfa-error")).toHaveText("That code didn't work. Try again.");
});

Then("the enrolled policy member still needs MFA in a fresh browser", async ({ policyApp }) => {
  const page = await policyApp.openBrowser("optional-enrolled");
  await passwordSignIn(page, account(policyApp));
  await expect(page.getByRole("textbox", { name: "Authentication code", exact: true })).toBeVisible();
});
