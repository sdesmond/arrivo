import bcrypt from "bcryptjs";
import { expect, type Locator, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { DEFAULT_PASSWORD_POLICY, UserRole, type PasswordPolicy } from "../../../src/data/types";
import { savePasswordPolicy, type PasswordPolicyDatabase } from "../../../src/lib/password-policy-store";
import { Given, When, Then } from "../fixtures";
import type { PolicyAppRegistry } from "../fixtures";
import { waitForServerActionResponse } from "../server-action";
import { cloneSecurityPolicyUserMother, type SecurityPolicyUser } from "../security-policy-fixture";

// Every scenario here runs against its own app and database (see security-policy-fixture.ts): password rules are one
// row that all other scenarios read, so they are never changed on the shared E2E database.

const NAVIGATION_TIMEOUT_MS = 120_000;
const ACTION_TIMEOUT_MS = 30_000;

function policyFrom(
  minLength: number,
  maxLength: number,
  uppercase: number,
  numbers: number,
  special: number
): PasswordPolicy {
  // A class minimum of zero means the class is not required.
  return { minLength, maxLength, minUppercase: uppercase, minNumbers: numbers, minSpecial: special };
}

async function seedAccounts(policyApp: PolicyAppRegistry) {
  for (const role of ["admin", "member", "pending"] as const) {
    policyApp.users.set(role, await policyApp.app.seedUser(cloneSecurityPolicyUserMother(role)));
  }
}

function user(policyApp: PolicyAppRegistry, role: string): SecurityPolicyUser {
  const found = policyApp.users.get(role);
  if (!found) throw new Error(`No "${role}" account was seeded.`);
  return found;
}

/**
 * Waits for the page to finish loading. It deliberately does not wait for "networkidle" (the dev server keeps
 * connections open, so it never settles). Hydration is handled where it matters: `fillField` retries until its value
 * sticks, and `clickAndWaitForAction` retries a click until its server action fires.
 */
async function settle(page: Page) {
  await page.waitForLoadState("load");
}

/** Fills and confirms the value stuck, retrying if hydration replaced it. */
async function fillField(locator: Locator, value: string) {
  await expect(async () => {
    await locator.fill(value);
    await expect(locator).toHaveValue(value, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

async function signIn(page: Page, account: SecurityPolicyUser) {
  await page.goto("/sign-in");
  await settle(page);
  await page.getByRole("textbox", { name: "Username" }).fill(account.username);
  await page.getByRole("textbox", { name: "Password" }).fill(account.password!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/trips", { timeout: NAVIGATION_TIMEOUT_MS });
}

// --- Isolated apps -------------------------------------------------------------------------------------------------

Given(
  "an isolated app with password rules {int} to {int}, requiring {int} uppercase, {int} numbers and {int} special characters",
  async ({ policyApp }, minLength: number, maxLength: number, uppercase: number, numbers: number, special: number) => {
    await policyApp.start({ policy: policyFrom(minLength, maxLength, uppercase, numbers, special) });
    await seedAccounts(policyApp);
  }
);

Given(
  "an isolated first-run app with password rules {int} to {int}, requiring {int} uppercase, {int} numbers and {int} special characters",
  async ({ policyApp }, minLength: number, maxLength: number, uppercase: number, numbers: number, special: number) => {
    await policyApp.start({
      initialized: false,
      policy: policyFrom(minLength, maxLength, uppercase, numbers, special),
    });
  }
);

Given("the {string} browser is signed in as the policy {word}", async ({ policyApp }, label: string, role: string) => {
  const page = await policyApp.openBrowser(label);
  await signIn(page, user(policyApp, role));
});

// --- Security settings ---------------------------------------------------------------------------------------------

When("the {string} browser opens the Security settings", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  await page.goto("/admin/security");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Password rules", level: 3 })).toBeVisible();
});

When("the {string} browser reloads the Security settings", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  await page.reload();
  await settle(page);
  await expect(page.getByRole("heading", { name: "Password rules", level: 3 })).toBeVisible();
});

When(
  "the {string} browser sets {string} to {string}",
  async ({ policyApp }, label: string, field: string, value: string) => {
    await fillField(policyApp.browser(label).getByLabel(field, { exact: true }), value);
  }
);

/**
 * Clicks until the server action fires, so a click that lands before hydration is simply retried. The response is armed
 * before each click and awaited after it: a reload right afterwards must not abort the in-flight save.
 */
async function clickAndWaitForAction(page: Page, button: Locator, pathIncludes: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = waitForServerActionResponse(page, { pathIncludes, timeoutMs: 5_000 });
    await button.click();
    try {
      await response;
      return;
    } catch (error) {
      // A click before hydration never reaches React; a failed (non-2xx) action must not be retried.
      if (error instanceof Error && error.message.includes("failed with status")) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

When("the {string} browser saves the password rules", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  await clickAndWaitForAction(page, page.getByRole("button", { name: "Save password rules" }), "/admin/security");
});

When("the {string} browser tries to save invalid password rules", async ({ policyApp }, label: string) => {
  // Refused in the browser by the shared validator, so no request is made.
  await policyApp.browser(label).getByRole("button", { name: "Save password rules" }).click();
});

Then("the {string} browser shows the password rules saved message", async ({ policyApp }, label: string) => {
  await expect(policyApp.browser(label).getByRole("status").filter({ hasText: "Password rules saved." })).toBeVisible();
});

Then(
  "the {string} browser shows the password rule values {string}",
  async ({ policyApp }, label: string, values: string) => {
    // "Field label=value, Field label=value": the form shows the saved values, so this also proves a refresh landed.
    for (const pair of values.split(", ")) {
      const [field, value] = pair.split("=");
      await expect(policyApp.browser(label).getByLabel(field, { exact: true })).toHaveValue(value);
    }
  }
);

Then(
  "the {string} browser shows the password rules error {string}",
  async ({ policyApp }, label: string, message: string) => {
    await expect(policyApp.browser(label).getByRole("alert").filter({ hasText: message })).toBeVisible();
  }
);

Then("the {string} browser has focus on {string}", async ({ policyApp }, label: string, field: string) => {
  await expect(policyApp.browser(label).getByLabel(field, { exact: true })).toBeFocused();
});

Then(
  "the stored password rules are {int} to {int}, requiring {int} uppercase, {int} numbers and {int} special characters",
  async ({ policyApp }, minLength: number, maxLength: number, uppercase: number, numbers: number, special: number) => {
    expect(await policyApp.app.readPolicy()).toEqual(policyFrom(minLength, maxLength, uppercase, numbers, special));
  }
);

Then("the stored password rules are still the defaults", async ({ policyApp }) => {
  expect(await policyApp.app.readPolicy()).toEqual(DEFAULT_PASSWORD_POLICY);
});

// --- Authority and direct saves ------------------------------------------------------------------------------------

Then("the {string} browser cannot open the Security settings", async ({ policyApp }, label: string) => {
  const response = await policyApp.browser(label).goto("/admin/security");
  expect(response?.status()).toBe(404);
  await expect(policyApp.browser(label).getByRole("heading", { name: "Password rules" })).toHaveCount(0);
});

const directResults = new WeakMap<PolicyAppRegistry, unknown>();

async function directSave(policyApp: PolicyAppRegistry, role: string, policy: unknown) {
  const database = policyApp.app.database as unknown as PasswordPolicyDatabase;
  const expected = await policyApp.app.readPolicy();
  directResults.set(policyApp, await savePasswordPolicy(database, user(policyApp, role).id, policy, expected));
}

When("the policy {word} tries to save valid password rules directly", async ({ policyApp }, role: string) => {
  await directSave(policyApp, role, policyFrom(12, 18, 1, 1, 1));
});

When("the policy {word} tries to save impossible password rules directly", async ({ policyApp }, role: string) => {
  await directSave(policyApp, role, policyFrom(16, 15, 0, 0, 0));
});

Then("the direct save is refused as {word}", async ({ policyApp }, status: string) => {
  expect(directResults.get(policyApp)).toMatchObject({ status });
});

When(
  "the stored password rules are changed to {int} to {int} behind the app",
  async ({ policyApp }, minLength: number, maxLength: number) => {
    await policyApp.app.writePolicy(policyFrom(minLength, maxLength, 0, 0, 0));
  }
);

// --- Existing credentials ------------------------------------------------------------------------------------------

When(
  "the policy member signs in with their original password in the {string} browser",
  async ({ policyApp }, label: string) => {
    const page = await policyApp.openBrowser(label);
    await signIn(page, user(policyApp, "member"));
    // No forced change: rules apply only where a password is chosen.
    await expect(page).toHaveURL(/\/trips$/);
  }
);

Then("the policy member's stored password and sessions are untouched", async ({ policyApp }) => {
  const member = user(policyApp, "member");
  const [row] = await policyApp.app.client`select password_hash, session_version from users where id = ${member.id}`;
  expect(await bcrypt.compare(member.password!, row.password_hash)).toBe(true);
  expect(row.session_version).toBe(0);
});

// --- New-password forms --------------------------------------------------------------------------------------------

interface FlowDriver {
  postPath: string;
  open(policyApp: PolicyAppRegistry, page: Page): Promise<void>;
  newPassword(page: Page): Locator;
  confirmation(page: Page): Locator;
  /** Fills everything except the password pair. */
  prepare(policyApp: PolicyAppRegistry, page: Page): Promise<void>;
  submit(page: Page): Locator;
}

const SETUP_DIALOG = { name: "Set up your account" };
const FIRST_ADMIN_USERNAME = "first-admin";

function currentCode(secret: string): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
}

const FLOWS: Record<string, FlowDriver> = {
  setup: {
    postPath: "/setup",
    async open(_policyApp, page) {
      await page.goto("/setup");
      await settle(page);
    },
    newPassword: (page) => page.getByLabel("Password", { exact: true }),
    confirmation: (page) => page.getByLabel("Confirm password"),
    async prepare(_policyApp, page) {
      await page.getByLabel("Username").fill(FIRST_ADMIN_USERNAME);
      await page.getByLabel("Name", { exact: true }).fill("First Admin");
    },
    submit: (page) => page.getByRole("button", { name: "Create admin account" }),
  },
  "account setup": {
    postPath: "/account-setup",
    async open(policyApp, page) {
      await page.goto(await policyApp.app.issueLink("setup", user(policyApp, "pending"), user(policyApp, "admin")));
      await expect(page).toHaveURL(/\/account-setup$/);
      await expect(page.getByRole("dialog", SETUP_DIALOG)).toBeVisible();
      await settle(page);
    },
    newPassword: (page) => page.getByRole("dialog", SETUP_DIALOG).getByLabel("Password", { exact: true }),
    confirmation: (page) => page.getByRole("dialog", SETUP_DIALOG).getByLabel("Confirm password"),
    async prepare(_policyApp, page) {
      await page.getByRole("dialog", SETUP_DIALOG).getByLabel("Name").fill("Alex Pending");
    },
    submit: (page) => page.getByRole("dialog", SETUP_DIALOG).getByRole("button", { name: "Save and continue" }),
  },
  reset: {
    postPath: "/account-reset",
    async open(policyApp, page) {
      await page.goto(await policyApp.app.issueLink("reset", user(policyApp, "member"), user(policyApp, "admin")));
      await expect(page).toHaveURL(/\/account-reset$/);
      await settle(page);
    },
    newPassword: (page) => page.getByLabel("Password", { exact: true }),
    confirmation: (page) => page.getByLabel("Confirm password"),
    async prepare() {},
    submit: (page) => page.getByRole("button", { name: "Reset password" }),
  },
  recovery: {
    postPath: "/account-recovery",
    async open(policyApp, page) {
      await page.goto(await policyApp.app.issueLink("recovery", user(policyApp, "admin")));
      await expect(page).toHaveURL(/\/account-recovery$/);
      await expect(page.getByAltText("QR code for your authenticator app")).toBeVisible();
      await settle(page);
    },
    newPassword: (page) => page.getByLabel("Password", { exact: true }),
    confirmation: (page) => page.getByLabel("Confirm password"),
    async prepare(_policyApp, page) {
      const key = (await page.getByTestId("recovery-setup-key").textContent())?.trim();
      if (!key) throw new Error("Recovery setup key missing.");
      await page.getByLabel("Code from your app").fill(currentCode(key));
    },
    submit: (page) => page.getByRole("button", { name: "Recover account" }),
  },
  profile: {
    postPath: "/profile",
    async open(policyApp, page) {
      await signIn(page, user(policyApp, "member"));
      await page.goto("/profile");
      await settle(page);
      await page.getByRole("tab", { name: "Account" }).click();
      await page.getByRole("button", { name: "Change password" }).click();
      await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    },
    newPassword: (page) => page.getByLabel("New password", { exact: true }),
    confirmation: (page) => page.getByLabel("Confirm new password"),
    async prepare(policyApp, page) {
      await page.getByLabel("Current password").fill(user(policyApp, "member").password!);
    },
    submit: (page) => page.getByRole("button", { name: "Update password" }),
  },
};

function flow(name: string): FlowDriver {
  const driver = FLOWS[name];
  if (!driver) throw new Error(`Unknown password form "${name}".`);
  return driver;
}

const checklist = (page: Page) => page.getByRole("list", { name: "Password requirements" });

When("the {string} browser opens the {string} password form", async ({ policyApp }, label: string, name: string) => {
  const page = await policyApp.openBrowser(label);
  await flow(name).open(policyApp, page);
});

async function expectRequirements(page: Page, requirements: string) {
  const expected = requirements.split("|");
  await expect(checklist(page).getByRole("listitem")).toHaveCount(expected.length);
  for (const text of expected) await expect(checklist(page).getByText(text, { exact: true })).toBeVisible();
}

Then(
  "the {string} browser lists the password requirements {string}",
  async ({ policyApp }, label: string, requirements: string) => {
    await expectRequirements(policyApp.browser(label), requirements);
  }
);

Then(
  "the {string} browser lists the password requirements {string} before typing",
  async ({ policyApp }, label: string, requirements: string) => {
    const page = policyApp.browser(label);
    await expectRequirements(page, requirements);
    // Blank markers only: nothing is satisfied by an empty field.
    await expect(checklist(page).locator("svg")).toHaveCount(0);
  }
);

Then(
  "the {string} browser does not list a requirement for {string}",
  async ({ policyApp }, label: string, text: string) => {
    await expect(checklist(policyApp.browser(label)).getByText(text)).toHaveCount(0);
  }
);

When(
  "the {string} browser types {string} into the new password field of the {string} form",
  async ({ policyApp }, label: string, password: string, name: string) => {
    await fillField(flow(name).newPassword(policyApp.browser(label)), password);
  }
);

When(
  "the {string} browser deletes the last character in the new password field of the {string} form",
  async ({ policyApp }, label: string, name: string) => {
    const field = flow(name).newPassword(policyApp.browser(label));
    await field.press("End");
    await field.press("Backspace");
  }
);

When(
  "the {string} browser clears the new password field of the {string} form",
  async ({ policyApp }, label: string, name: string) => {
    await flow(name).newPassword(policyApp.browser(label)).fill("");
  }
);

Then("the {string} browser shows {int} requirements met", async ({ policyApp }, label: string, count: number) => {
  await expect(checklist(policyApp.browser(label)).locator("svg")).toHaveCount(count);
});

Then(
  "the {string} browser shows the requirement {string} as {word}",
  async ({ policyApp }, label: string, text: string, state: string) => {
    const item = checklist(policyApp.browser(label)).getByRole("listitem").filter({ hasText: text });
    await expect(item).toContainText(state === "met" ? "(met)" : "(not met)");
    const marks = item.locator("svg");
    if (state === "met") await expect(marks).toHaveCount(1);
    else await expect(marks).toHaveCount(0);
  }
);

Then("the {string} browser shows no failure marks", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  await expect(checklist(page).locator("svg.lucide-x, svg.lucide-circle-x, svg.lucide-x-circle")).toHaveCount(0);
});

const watchedPosts = new WeakMap<Page, string[]>();

When("the {string} browser starts watching for requests", async ({ policyApp }, label: string) => {
  const page = policyApp.browser(label);
  const posts: string[] = [];
  watchedPosts.set(page, posts);
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
});

Then("the {string} browser has made no request", async ({ policyApp }, label: string) => {
  // The checklist is local: only the form's own submit may ever post.
  expect(watchedPosts.get(policyApp.browser(label))).toEqual([]);
});

async function submitForm(policyApp: PolicyAppRegistry, label: string, name: string, password: string) {
  const driver = flow(name);
  const page = policyApp.browser(label);
  await driver.prepare(policyApp, page);
  await fillField(driver.newPassword(page), password);
  await driver.confirmation(page).fill(password);
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" && new URL(candidate.url()).pathname.startsWith(driver.postPath),
    { timeout: ACTION_TIMEOUT_MS }
  );
  await driver.submit(page).click();
  return response;
}

When(
  "the {string} browser submits the {string} form with the password {string} and it is refused",
  async ({ policyApp }, label: string, name: string, password: string) => {
    // A refusal re-renders the same page with an alert; nothing is saved.
    expect((await submitForm(policyApp, label, name, password)).status()).toBe(200);
  }
);

When(
  "the {string} browser submits the {string} form with the password {string} and it is accepted",
  async ({ policyApp }, label: string, name: string, password: string) => {
    expect((await submitForm(policyApp, label, name, password)).status()).toBeLessThan(400);
  }
);

Then(
  "the {string} browser shows the password error {string}",
  async ({ policyApp }, label: string, message: string) => {
    await expect(policyApp.browser(label).getByRole("alert").filter({ hasText: message })).toBeVisible();
  }
);

Then("the {string} browser lands on {string}", async ({ policyApp }, label: string, path: string) => {
  await policyApp.browser(label).waitForURL((url) => url.pathname === path, { timeout: NAVIGATION_TIMEOUT_MS });
});

Then("the {string} browser is shown the recovery codes", async ({ policyApp }, label: string) => {
  await expect(policyApp.browser(label).getByRole("heading", { name: "Save your recovery codes" })).toBeVisible({
    timeout: ACTION_TIMEOUT_MS,
  });
});

Then("the policy {word}'s stored password matches {string}", async ({ policyApp }, role: string, password: string) => {
  await expect
    .poll(
      async () => {
        const [row] = await policyApp.app
          .client`select password_hash from users where id = ${user(policyApp, role).id}`;
        return row?.password_hash ? bcrypt.compare(password, row.password_hash) : false;
      },
      { timeout: ACTION_TIMEOUT_MS }
    )
    .toBe(true);
});

Then(
  "the policy {word}'s stored password does not match {string}",
  async ({ policyApp }, role: string, password: string) => {
    const [row] = await policyApp.app.client`select password_hash from users where id = ${user(policyApp, role).id}`;
    expect(row.password_hash ? await bcrypt.compare(password, row.password_hash) : false).toBe(false);
  }
);

Then("the first-run admin's stored password matches {string}", async ({ policyApp }, password: string) => {
  await expect
    .poll(
      async () => {
        const [row] = await policyApp.app
          .client`select password_hash, role from users where username = ${FIRST_ADMIN_USERNAME}`;
        return row?.role === UserRole.Admin && (await bcrypt.compare(password, row.password_hash));
      },
      { timeout: ACTION_TIMEOUT_MS }
    )
    .toBe(true);
});

Then("no first-run admin account exists", async ({ policyApp }) => {
  const [{ count }] = await policyApp.app.client`select count(*)::int as count from users`;
  expect(count).toBe(0);
});
