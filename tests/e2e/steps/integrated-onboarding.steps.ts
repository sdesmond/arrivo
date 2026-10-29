import { expect, type APIResponse, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { credentialAuthorizations, documents, users } from "../../../src/db/schema";
import { createLocalFileSystemAdapter } from "../../../src/lib/storage/local-filesystem-adapter";
import { E2E_STORAGE_DIRECTORY } from "../../../scripts/e2e-storage.mjs";
import { After, Before, Given, Then, When } from "../fixtures";
import { withE2EDb } from "../e2e-db";
import { onboardingClientHeaders, openCredentialLink, recipientContext } from "../onboarding-browser";
import type { ScenarioFixtureContext } from "../scenario-fixture";
import { waitForServerActionResponse } from "../server-action";

const PASSWORD = "recipient-password-1";
const recipientOf = (scenario: ScenarioFixtureContext) => scenario.getValue<Page>("onboardingRecipient")!;
const usernameOf = (scenario: ScenarioFixtureContext) => scenario.getValue<string>("addedUsername")!;
const accountRows = (scenario: ScenarioFixtureContext) =>
  withE2EDb((database) =>
    database
      .select()
      .from(users)
      .where(eq(users.username, usernameOf(scenario)))
  );
const authorizations = (userId: string) =>
  withE2EDb((database) =>
    database.select().from(credentialAuthorizations).where(eq(credentialAuthorizations.userId, userId))
  );

Before(
  {
    tags: "@feat:integrated-onboarding or @feat:account-setup or @feat:setup-link-regeneration or @feat:unfinished-account-deletion or @feat:add-user-dialog",
  },
  async ({ page }) => {
    await page.context().setExtraHTTPHeaders(onboardingClientHeaders());
  }
);

After(async ({ scenario }) => {
  await scenario.getValue<Page>("onboardingRecipient")?.context().close();
  const storageUrl = scenario.getValue<string>("onboardingStorageUrl");
  if (storageUrl) await createLocalFileSystemAdapter(E2E_STORAGE_DIRECTORY).del(storageUrl);
});

When("the recipient opens the administrator-issued link", async ({ page, scenario }) => {
  const link = await page.getByRole("dialog").locator("p.select-text").textContent();
  if (!link) throw new Error("Missing one-time setup result.");
  scenario.setValue("onboardingLink", link);
  const [account] = await accountRows(scenario);
  scenario.setValue("onboardingAccountId", account.id);
  const recipient = await (await recipientContext(page)).newPage();
  scenario.setValue("onboardingRecipient", recipient);
  await openCredentialLink(recipient, link);
});

Then("the recipient must supply Name, password and confirmation for the fixed username", async ({ scenario }) => {
  const recipient = recipientOf(scenario);
  const dialog = recipient.getByRole("dialog", { name: "Set up your account" });
  await expect(dialog).toContainText(usernameOf(scenario));
  await expect(dialog.getByRole("textbox", { name: "Username" })).toHaveCount(0);
  for (const label of ["Name", "Password", "Confirm password"]) {
    await expect(dialog.getByLabel(label, { exact: true })).toHaveAttribute("required", "");
  }
  await recipient.keyboard.press("Escape");
  await recipient.mouse.click(4, 4);
  await expect(dialog).toBeVisible();
  const response = waitForServerActionResponse(recipient, { pathIncludes: "/account-setup" });
  await dialog.getByRole("button", { name: "Save and continue" }).click();
  await response;
  await expect(dialog.getByRole("alert")).toHaveText("Name is required.");
  expect((await accountRows(scenario))[0].passwordHash === null).toBe(true);
  expect((await authorizations(scenario.getValue<string>("onboardingAccountId")!))[0].consumedAt === null).toBe(true);
  const context = await recipientContext(recipient);
  try {
    const visitor = await context.newPage();
    await visitor.goto("/sign-in");
    await visitor.getByLabel("Username", { exact: true }).fill(usernameOf(scenario));
    await visitor.getByLabel("Password", { exact: true }).fill(PASSWORD);
    const refused = waitForServerActionResponse(visitor, { pathIncludes: "/sign-in" });
    await visitor.getByRole("button", { name: "Sign in", exact: true }).click();
    await refused;
    expect(new URL(visitor.url()).pathname === "/sign-in").toBe(true);
    const session = await (await visitor.request.get("/api/auth/session")).json();
    expect(Boolean(session?.user?.id)).toBe(false);
  } finally {
    await context.close();
  }
});

When("the recipient completes setup and signs in again", async ({ scenario }) => {
  const recipient = recipientOf(scenario);
  await recipient.getByLabel("Name", { exact: true }).fill("Integrated Recipient");
  await recipient.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await recipient.getByLabel("Confirm password", { exact: true }).fill(PASSWORD);
  const response = waitForServerActionResponse(recipient, {
    pathIncludes: "/account-setup",
    expectedStatus: 303,
    timeoutMs: 15_000,
  });
  await recipient.getByRole("button", { name: "Save and continue" }).click();
  await response;
  await recipient.waitForURL("**/trips");
  const initialSession = await (await recipient.request.get("/api/auth/session")).json();
  expect(initialSession.user?.id === scenario.getValue<string>("onboardingAccountId")).toBe(true);
  await recipient.context().clearCookies();
  await recipient.goto("/sign-in");
  await recipient.getByLabel("Username", { exact: true }).fill(usernameOf(scenario));
  await recipient.getByLabel("Password", { exact: true }).fill(PASSWORD);
  const signIn = waitForServerActionResponse(recipient, {
    pathIncludes: "/sign-in",
    expectedStatus: 303,
    timeoutMs: 15_000,
  });
  await recipient.getByRole("button", { name: "Sign in", exact: true }).click();
  await signIn;
  await recipient.waitForURL("**/trips");
});

Then("Users and the recipient identify the original account and the link is consumed", async ({ page, scenario }) => {
  const recipient = recipientOf(scenario);
  const session = await (await recipient.request.get("/api/auth/session")).json();
  expect(session.user?.id === scenario.getValue<string>("onboardingAccountId")).toBe(true);
  const rows = await accountRows(scenario);
  expect(rows.length === 1 && rows[0].id === session.user.id && rows[0].name === "Integrated Recipient").toBe(true);
  expect((await authorizations(rows[0].id))[0].consumedAt !== null).toBe(true);
  await page.reload();
  const row = page.getByRole("listitem").filter({ has: page.getByText(usernameOf(scenario), { exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Setup complete");
  await recipient.context().clearCookies();
  await openCredentialLink(recipient, scenario.getValue<string>("onboardingLink")!);
  await expect(recipient.getByRole("heading", { name: "Setup link unavailable" })).toBeVisible();
});

Then("bootstrap remains closed with the added account still pending", async ({ page, scenario }) => {
  const context = await recipientContext(page);
  try {
    const visitor = await context.newPage();
    for (const path of ["/setup", "/sign-up"]) {
      await visitor.goto(path);
      expect(new URL(visitor.url()).pathname === "/sign-in").toBe(true);
      await expect(visitor.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
      await expect(visitor.locator('a[href="/sign-up"], a[href="/setup"]')).toHaveCount(0);
    }
    const [account] = await accountRows(scenario);
    scenario.setValue("onboardingAccountId", account.id);
    expect(account.passwordHash === null).toBe(true);
    expect((await authorizations(account.id)).length).toBe(1);
  } finally {
    await context.close();
  }
});

When("I submit the added username again with different casing", async ({ page, scenario }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Add User", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(usernameOf(scenario).toUpperCase());
  const response = waitForServerActionResponse(page, { pathIncludes: "/admin/users" });
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await response;
});

Then("the duplicate creates neither an account nor another authorization", async ({ page, scenario }) => {
  await expect(page.getByLabel("Username", { exact: true })).toHaveAccessibleDescription(
    "That username is already taken."
  );
  const rows = await accountRows(scenario);
  expect(rows.length === 1 && rows[0].id === scenario.getValue<string>("onboardingAccountId")).toBe(true);
  expect((await authorizations(rows[0].id)).length).toBe(1);
});

interface CapturedMutation {
  path: string;
  headers: Record<string, string>;
  body: Buffer;
  documentId: string;
}

Given("authorized protected resources and a captured mutation exist", async ({ page, scenario }) => {
  const trip = await scenario.ensureCurrentTrip();
  await scenario.gotoCurrentTrip(page);
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const uploaded = waitForServerActionResponse(page, { pathIncludes: `/trips/${trip.id}`, timeoutMs: 15_000 });
  await page.locator("#doc-upload").setInputFiles({
    name: "protected.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nProtected onboarding content\n%%EOF"),
  });
  await uploaded;
  await expect(page.getByText("protected.pdf", { exact: true })).toBeVisible();
  const [document] = await withE2EDb((database) =>
    database.select().from(documents).where(eq(documents.tripId, trip.id))
  );
  if (!document.url) throw new Error("Uploaded document has no storage URL.");
  scenario.setValue("onboardingStorageUrl", document.url);
  const stored = await page.request.get(document.url);
  expect(stored.status()).toBe(200);
  expect((await stored.body()).includes(Buffer.from("Protected onboarding content"))).toBe(true);
  for (const path of ["/api/users/me/events", `/api/trips/${trip.id}/events`]) {
    const accessible = await page.evaluate(async (url) => {
      const controller = new AbortController();
      try {
        const response = await fetch(url, { signal: controller.signal });
        return response.ok && response.headers.get("content-type")?.includes("text/event-stream") === true;
      } finally {
        controller.abort();
      }
    }, path);
    expect(accessible).toBe(true);
  }
  await page.getByText("protected.pdf", { exact: true }).click();
  const input = page.getByRole("textbox");
  await input.fill("renamed-protected.pdf");
  const response = waitForServerActionResponse(page, { pathIncludes: `/trips/${trip.id}` });
  await input.press("Enter");
  const request = (await response)!.request();
  const headers = request.headers();
  expect(Boolean(headers["next-action"])).toBe(true);
  scenario.setValue<CapturedMutation>("onboardingMutation", {
    path: new URL(request.url()).pathname,
    headers: {
      "next-action": headers["next-action"],
      "content-type": headers["content-type"],
      origin: new URL(page.url()).origin,
    },
    body: request.postDataBuffer()!,
    documentId: document.id,
  });
  const [renamed] = await withE2EDb((database) =>
    database.select().from(documents).where(eq(documents.id, document.id))
  );
  expect(renamed.name).toBe("renamed-protected.pdf");
  await withE2EDb((database) =>
    database.update(documents).set({ name: "protected.pdf" }).where(eq(documents.id, document.id))
  );
});

function refusesData(response: APIResponse): void {
  expect(response.status() >= 300 && response.status() < 400).toBe(true);
  expect(new URL(response.headers().location, "http://localhost").pathname === "/sign-in").toBe(true);
  expect(response.headers()["content-type"]?.includes("text/event-stream") === true).toBe(false);
}

Then(
  "setup-only requests refuse app routes, the captured action, stored file and both feeds",
  async ({ page, scenario }) => {
    const cookies = await page.context().cookies();
    const setupCookie = cookies.find((cookie) => cookie.name === "arrivo_account_setup");
    expect(setupCookie).toBeDefined();
    expect(cookies.some((cookie) => cookie.name.includes("session-token"))).toBe(false);
    // The browser only sends the cookie under /account-setup; send it by hand so these requests carry the setup context.
    const setupContext = { cookie: `arrivo_account_setup=${setupCookie!.value}` };
    const trip = scenario.currentTrip!;
    for (const path of [
      "/trips",
      `/trips/${trip.id}`,
      "/profile",
      "/packing",
      "/travel-history",
      "/admin/users",
      "/admin/activity",
      scenario.getValue<string>("onboardingStorageUrl")!,
      "/api/users/me/events",
      `/api/trips/${trip.id}/events`,
    ]) {
      const response = await page.request.get(path, { headers: setupContext, maxRedirects: 0 });
      refusesData(response);
      expect((await response.text()).includes("Protected onboarding content")).toBe(false);
    }
    const mutation = scenario.getValue<CapturedMutation>("onboardingMutation")!;
    const response = await page.request.post(mutation.path, {
      headers: { ...mutation.headers, ...setupContext },
      data: mutation.body,
      maxRedirects: 0,
    });
    expect(response.status() >= 300 && response.status() < 400).toBe(true);
    const destination = response.headers().location ?? response.headers()["x-action-redirect"]?.split(";")[0];
    expect(Boolean(destination) && new URL(destination!, "http://localhost").pathname === "/sign-in").toBe(true);
    const [document] = await withE2EDb((database) =>
      database.select().from(documents).where(eq(documents.id, mutation.documentId))
    );
    expect(document.name).toBe("protected.pdf");
  }
);
