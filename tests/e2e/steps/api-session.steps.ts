import { expect, type Page } from "@playwright/test";
import { apiClient, disposeAnonymousApiClient, markAnonymousApiRole } from "../anonymous-api";
import { Given, When, Then, After } from "../fixtures";
import { state } from "../api-support";

const rememberedCookies = new WeakMap<Page, Awaited<ReturnType<ReturnType<Page["context"]>["cookies"]>>>();
After(async ({ page }) => {
  await disposeAnonymousApiClient(page);
});
Given("I remember the signed-in browser cookies", async ({ page }) => {
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name.includes("session-token"))).toBe(true);
  rememberedCookies.set(page, cookies);
});
Given("the signed-in browser cookies return", async ({ page }) => {
  await page.context().addCookies(rememberedCookies.get(page)!);
});
Then("the signed-in browser cookies remain available", async ({ page }) => {
  expect((await page.context().cookies()).some((cookie) => cookie.name.includes("session-token"))).toBe(true);
});
Given("I am {string} for the API metadata", async ({ page }, audience: string) => {
  if (audience === "anonymous") await markAnonymousApiRole(page);
});
When("I request the API metadata", async ({ page }) => {
  state(page).response = await (await apiClient(page)).get("/api/v1/meta");
});
Then("the API metadata is exactly the public version and capabilities", async ({ page }) => {
  const response = state(page).response!;
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
  expect(await response.json()).toEqual({ apiVersion: 1, capabilities: ["idempotency-key", "sharing-invitations"] });
});
