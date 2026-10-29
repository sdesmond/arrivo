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
import { After, Given, When, Then } from "../fixtures";
import { waitForServerActionResponse } from "../server-action";
import { exchangeCredentialLink, openCredentialLink, recipientContext } from "../onboarding-browser";

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
  const { user } = await scenario.materialize({ user: { mother: "pending", setCurrent: false } });
  if (!user) throw new Error("Missing pending scenario account.");
  scenario.setValue<SetupLink>(LINK_KEY, { userId: user.id, username: user.username, ...(await issueLink(user.id)) });
  // Recipients are not signed in: drop the baseline session so only the setup context can be in play.
  scenario.signOut();
  // Leave the authenticated app first: in-flight session refreshes can otherwise restore its cookie.
  await page.goto("about:blank");
  await page.context().clearCookies();
});

When("I open the setup link", async ({ page, scenario }) => {
  await openCredentialLink(page, openUrl(linkOf(scenario).token));
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
  await openCredentialLink(page, openUrl(await tokens[kind]()));
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
  expect(page.url().includes(linkOf(scenario).token)).toBe(false);
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
  const cookies = await page.context().cookies();
  const setupCookie = cookies.find((cookie) => cookie.name === SETUP_COOKIE);
  expect(setupCookie).toBeDefined();
  expect(cookies.filter((cookie) => /session-token/.test(cookie.name))).toEqual([]);
  // The browser only sends the cookie under /account-setup; send it by hand so this still proves the proxy refuses it.
  const response = await page.request.get(path, {
    headers: { cookie: `${SETUP_COOKIE}=${setupCookie!.value}` },
    maxRedirects: 0,
  });
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
  const response = await exchangeCredentialLink(page, openUrl(linkOf(scenario).token));
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
  expect(JSON.stringify(event).includes(linkOf(scenario).token)).toBe(false);
});

Then("Activity holds exactly one setup completed event for the pending account", async ({ scenario }) => {
  await expect.poll(async () => (await setupCompletedEvents(scenario)).length).toBe(1);
});

When("two browsers complete the setup link at the same time", async ({ page, scenario }) => {
  const contexts = await Promise.all([recipientContext(page), recipientContext(page)]);
  const pages = await Promise.all(contexts.map((context) => context.newPage()));
  scenario.setValue<Page[]>("racerPages", pages);
  for (const racer of pages) {
    await openCredentialLink(racer, openUrl(linkOf(scenario).token));
    await fillSetupForm(racer, "Racer", "chosen-pass-1", "chosen-pass-1");
  }
  await Promise.all(pages.map((racer) => submitSetupForm(racer)));
});

After(async ({ scenario }) => {
  await Promise.all((scenario.getValue<Page[]>("racerPages") ?? []).map((racer) => racer.context().close()));
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

// --- Explicit account switching ---------------------------------------------------------------------------------
Given("I am signed in to a different completed account", async ({ page, scenario }) => {
  await scenario.materialize({ user: {} });
  await scenario.signIn(page);
});

Then("I see the explicit setup sign-out prompt", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Sign out to continue setup.", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out and continue", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});

Then("my current account still accesses Trips", async ({ page }) => {
  const response = await page.request.get("/trips", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
});

When("I explicitly sign out and continue setup", async ({ page, scenario }) => {
  const setupCookie = (await page.context().cookies()).find((cookie) => cookie.name === SETUP_COOKIE);
  scenario.setValue("setupCookieExpiry", setupCookie?.expires);
  const response = waitForServerActionResponse(page, { pathIncludes: "/account-setup", expectedStatus: 303 });
  await page.getByRole("button", { name: "Sign out and continue", exact: true }).click();
  await response;
  scenario.signOut();
});

When("the held setup link expires", async ({ scenario }) => {
  await withE2EDb((db) =>
    db
      .update(credentialAuthorizations)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(credentialAuthorizations.userId, linkOf(scenario).userId))
  );
});

Then("the unavailable setup page offers no sign-out control", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Sign out and continue", exact: true })).toHaveCount(0);
});

Then("the setup cookie retains its original expiry", async ({ page, scenario }) => {
  const setupCookie = (await page.context().cookies()).find((cookie) => cookie.name === SETUP_COOKIE);
  expect(setupCookie?.expires).toBe(scenario.getValue<number>("setupCookieExpiry"));
});
