import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { activityEvents, credentialAuthorizations, users } from "../../../src/db/schema";
import { CredentialAuthorizationPurpose } from "../../../src/data/types";
import {
  issueCredentialAuthorization,
  type CredentialAuthorizationDatabase,
} from "../../../src/lib/credential-authorizations";
import { withE2EDb } from "../e2e-db";
import { BASELINE_E2E_USER } from "../e2e-seed-data";
import { Given, When, Then } from "../fixtures";

const LINK_KEY = "accountSetupLink";
const SETUP_COOKIE = "arrivo_account_setup";
const HOUR_MS = 60 * 60_000;

interface SetupLink {
  userId: string;
  username: string;
  token: string;
  expiresAt: string;
}

// The token only ever lives in this scenario's memory and the request URL; it is never logged or written to fixtures.
async function issueLink(userId: string, clock?: () => Date): Promise<{ token: string; expiresAt: string }> {
  return withE2EDb(async (db) => {
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.username, BASELINE_E2E_USER.username));
    const result = await issueCredentialAuthorization(
      db as unknown as CredentialAuthorizationDatabase,
      { kind: "admin", actorUserId: admin.id },
      { userId, purpose: CredentialAuthorizationPurpose.Setup },
      clock
    );
    if (!result.ok) throw new Error(`Setup link issuance failed: ${result.reason}`);
    return { token: result.token, expiresAt: result.expiresAt };
  });
}

const linkOf = (scenario: { getValue<T>(key: string): T | undefined }) => scenario.getValue<SetupLink>(LINK_KEY)!;
const openUrl = (token: string) => `/account-setup/open?token=${token}`;

Given("a pending account with a fresh setup link", async ({ page, scenario }) => {
  const username = scenario.uniqueUsername("pending");
  const userId = await withE2EDb(async (db) => {
    const [created] = await db
      .insert(users)
      .values({ username, name: "Pending Person", passwordHash: null, role: "member" })
      .returning({ id: users.id });
    return created.id;
  });
  scenario.registerCleanup({ entity: "user", id: userId });
  scenario.setValue<SetupLink>(LINK_KEY, { userId, username, ...(await issueLink(userId)) });
  // Recipients are not signed in: drop the baseline session so only the setup context can be in play.
  scenario.signOut();
  await page.context().clearCookies();
});

When("I open the setup link", async ({ page, scenario }) => {
  await page.goto(openUrl(linkOf(scenario).token));
});

When("I open a setup link that is {word}", async ({ page, scenario }, kind: string) => {
  const link = linkOf(scenario);
  const tokens: Record<string, () => Promise<string>> = {
    malformed: async () => "not-a-token",
    unknown: async () => randomBytes(32).toString("base64url"),
    replaced: async () => {
      const stale = link.token;
      scenario.setValue<SetupLink>(LINK_KEY, { ...link, ...(await issueLink(link.userId)) });
      return stale;
    },
    expired: async () => (await issueLink(link.userId, () => new Date(Date.now() - 25 * HOUR_MS))).token,
  };
  await page.goto(openUrl(await tokens[kind]()));
});

When("the setup link is replaced", async ({ scenario }) => {
  const link = linkOf(scenario);
  scenario.setValue<SetupLink>(LINK_KEY, { ...link, ...(await issueLink(link.userId)) });
});

When("the pending account is deleted", async ({ scenario }) => {
  await withE2EDb((db) => db.delete(users).where(eq(users.id, linkOf(scenario).userId)));
});

When("I try to dismiss the setup dialog", async ({ page }) => {
  await page.keyboard.press("Escape");
  await page.mouse.click(4, 4);
});

Then("I see the account setup dialog for the pending account", async ({ page, scenario }) => {
  await expect(page).toHaveURL(/\/account-setup$/);
  const dialog = page.getByRole("dialog", { name: "Set up your account" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(linkOf(scenario).username);
  await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(0);
});

Then("the address has no token", async ({ page, scenario }) => {
  expect(page.url()).not.toContain(linkOf(scenario).token);
  expect(new URL(page.url()).search).toBe("");
});

Then("the setup link is still valid with its original expiry", async ({ scenario }) => {
  const link = linkOf(scenario);
  const [row] = await withE2EDb((db) =>
    db
      .select()
      .from(credentialAuthorizations)
      .where(eq(credentialAuthorizations.digest, createHash("sha256").update(link.token).digest("hex")))
  );
  expect(row.consumedAt).toBeNull();
  expect(row.invalidatedAt).toBeNull();
  expect(row.expiresAt.toISOString()).toBe(link.expiresAt);
});

Then("requesting {string} with only the setup context redirects to sign-in", async ({ page }, path: string) => {
  const names = (await page.context().cookies()).map((cookie) => cookie.name);
  expect(names).toContain(SETUP_COOKIE);
  expect(names.filter((name) => /session-token/.test(name))).toEqual([]);
  const response = await page.request.get(path, { maxRedirects: 0 });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(new URL(response.headers().location, "http://localhost").pathname).toBe("/sign-in");
});

Then("I see the setup link unavailable page", async ({ page }) => {
  await expect(page).toHaveURL(/\/account-setup$/);
  await expect(page.getByRole("heading", { name: "Setup link unavailable" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // A stale cookie is dropped on the way, not left behind.
  expect((await page.context().cookies()).map((cookie) => cookie.name)).not.toContain(SETUP_COOKIE);
});

Then("no setup context cookie was set", async ({ page }) => {
  expect((await page.context().cookies()).map((cookie) => cookie.name)).not.toContain(SETUP_COOKIE);
});

Then("the setup exchange response is not cacheable and sends no referrer", async ({ page, scenario }) => {
  const response = await page.request.get(openUrl(linkOf(scenario).token), { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect(new URL(response.headers().location).search).toBe("");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
});

Then("the setup page response is not cacheable and sends no referrer", async ({ page }) => {
  const response = await page.reload();
  // `next dev` replaces the page's Cache-Control with no-cache; production keeps no-store from the proxy.
  expect(response!.headers()["cache-control"]).toMatch(/no-store|no-cache/);
  expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
});

// --- Completion ---------------------------------------------------------------------------------------------------

const SETUP_DIALOG = { name: "Set up your account" };

async function fillSetupForm(page: Page, name: string, password: string, confirmation: string) {
  const dialog = page.getByRole("dialog", SETUP_DIALOG);
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog.getByLabel("Confirm password").fill(confirmation);
}

const submitSetupForm = (page: Page) =>
  page.getByRole("dialog", SETUP_DIALOG).getByRole("button", { name: "Save and continue" }).click();

When(
  "I fill the setup form with name {string}, password {string} and confirmation {string}",
  async ({ page }, name: string, password: string, confirmation: string) => {
    await fillSetupForm(page, name, password, confirmation);
  }
);

When("I submit the setup form", async ({ page }) => {
  await submitSetupForm(page);
});

When(
  "I complete the setup form with name {string} and password {string}",
  async ({ page }, name: string, password: string) => {
    await fillSetupForm(page, name, password, password);
    await submitSetupForm(page);
  }
);

Then("I see the setup error {string}", async ({ page }, message: string) => {
  await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
  await expect(page.getByRole("dialog", SETUP_DIALOG)).toBeVisible();
});

Then("the setup name field still holds {string}", async ({ page }, name: string) => {
  await expect(page.getByRole("dialog", SETUP_DIALOG).getByLabel("Name")).toHaveValue(name);
});

const accountOf = (scenario: { getValue<T>(key: string): T | undefined }) =>
  withE2EDb(async (db) => {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, linkOf(scenario).userId));
    return row;
  });

Then("the pending account has no password", async ({ scenario }) => {
  expect((await accountOf(scenario)).passwordHash).toBeNull();
});

Then(
  "the pending account has the name {string} and password {string}",
  async ({ scenario }, name: string, password: string) => {
    const row = await accountOf(scenario);
    expect(row.name).toBe(name);
    expect(row.passwordHash).not.toBeNull();
    expect(await bcrypt.compare(password, row.passwordHash!)).toBe(true);
  }
);

const setupCompletedEvents = (scenario: { getValue<T>(key: string): T | undefined }) =>
  withE2EDb((db) =>
    db
      .select()
      .from(activityEvents)
      .where(and(eq(activityEvents.type, "setup_completed"), eq(activityEvents.actorId, linkOf(scenario).userId)))
  );

Then("Activity holds a setup completed event for the pending account", async ({ scenario }) => {
  // Activity is written after the response, so poll briefly.
  await expect.poll(async () => (await setupCompletedEvents(scenario)).length).toBe(1);
  const [event] = await setupCompletedEvents(scenario);
  expect(event.actorUsername).toBe(linkOf(scenario).username);
  expect(JSON.stringify(event)).not.toContain(linkOf(scenario).token);
});

Then("Activity holds exactly one setup completed event for the pending account", async ({ scenario }) => {
  await expect.poll(async () => (await setupCompletedEvents(scenario)).length).toBe(1);
});

When("two browsers complete the setup link at the same time", async ({ page, scenario }) => {
  const browser = page.context().browser()!;
  const baseURL = new URL(page.url() === "about:blank" ? "http://localhost:3001" : page.url()).origin;
  const contexts = await Promise.all([browser.newContext({ baseURL }), browser.newContext({ baseURL })]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  for (const racer of pages) {
    await racer.goto(openUrl(linkOf(scenario).token));
    await fillSetupForm(racer, "Racer", "chosen-pass-1", "chosen-pass-1");
  }
  await Promise.all(pages.map((racer) => submitSetupForm(racer)));
  scenario.setValue<Page[]>("racerPages", pages);
});

Then("exactly one browser completed setup", async ({ scenario }) => {
  const pages = scenario.getValue<Page[]>("racerPages")!;
  const unavailableHeading = (racer: Page) => racer.getByRole("heading", { name: "Setup link unavailable" });
  const outcomes = await Promise.all(
    pages.map(async (racer) => {
      // The pre-submit URL is also /account-setup, so wait for a terminal state: Trips or the unavailable page.
      await expect
        .poll(
          async () =>
            /\/trips/.test(racer.url()) || (await unavailableHeading(racer).isVisible()) ? "done" : "pending",
          {
            timeout: 20_000,
          }
        )
        .toBe("done");
      return /\/trips/.test(racer.url()) ? "success" : "unavailable";
    })
  );
  expect(outcomes.filter((outcome) => outcome === "success")).toHaveLength(1);
  const loser = pages[outcomes.indexOf("unavailable")];
  await expect(unavailableHeading(loser)).toBeVisible();
  const row = await accountOf(scenario);
  expect(row.name).toBe("Racer");
  await Promise.all(pages.map((racer) => racer.context().close()));
});
