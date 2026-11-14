import { request, type APIRequestContext, type Page } from "@playwright/test";

const anonymousPages = new WeakSet<Page>();
const anonymousClients = new WeakMap<Page, APIRequestContext>();

/**
 * Routes this page's API calls through a cookie-free client from now on. Clearing the browser cookies is not enough:
 * the open page can refresh its session and set the cookie again before the next request.
 */
export async function markAnonymousApiRole(page: Page): Promise<void> {
  await page.context().clearCookies();
  anonymousPages.add(page);
}

/** The page's request client: signed in as the browser, or cookie-free once marked anonymous. */
export async function apiClient(page: Page): Promise<APIRequestContext> {
  if (!anonymousPages.has(page)) return page.request;
  const client =
    anonymousClients.get(page) ??
    (await request.newContext({ baseURL: new URL(page.url()).origin, storageState: { cookies: [], origins: [] } }));
  anonymousClients.set(page, client);
  return client;
}

export async function disposeAnonymousApiClient(page: Page): Promise<void> {
  await anonymousClients.get(page)?.dispose();
  anonymousClients.delete(page);
  anonymousPages.delete(page);
}
