import { randomBytes } from "node:crypto";
import type { APIRequestContext, APIResponse, BrowserContext, Page } from "@playwright/test";

// Version-matched Playwright channel owners expose this internal wrapper. Internal calls bypass
// pw:api step recording, including both URL titles and channel params, even with rich reporters.
interface InternalApiOwner {
  _wrapApiCall<Result>(run: () => Promise<Result>, options: { internal: true }): Promise<Result>;
}

function credentialCall<Result>(owner: Page | APIRequestContext, run: () => Promise<Result>): Promise<Result> {
  return (owner as typeof owner & InternalApiOwner)._wrapApiCall(run, { internal: true });
}

/** Independent browser clients must not spend a shared setup-IP failure budget. */
export const onboardingClientHeaders = () => ({
  "x-forwarded-for": `2001:db8::${randomBytes(8).toString("hex").match(/.{4}/g)!.join(":")}`,
});

export async function openCredentialLink(page: Page, url: string): Promise<void> {
  try {
    await credentialCall(page, () => page.goto(url));
  } catch {
    // Playwright's default navigation error includes the credential URL.
    throw new Error("Credential navigation failed.");
  }
}

export async function exchangeCredentialLink(page: Page, url: string): Promise<APIResponse> {
  try {
    return await credentialCall(page.request, () => page.request.get(url, { maxRedirects: 0 }));
  } catch {
    throw new Error("Credential exchange request failed.");
  }
}

export async function recipientContext(page: Page): Promise<BrowserContext> {
  return page
    .context()
    .browser()!
    .newContext({
      baseURL: new URL(page.url() === "about:blank" ? `http://localhost:${process.env.PORT ?? "3001"}` : page.url())
        .origin,
      storageState: { cookies: [], origins: [] },
      extraHTTPHeaders: onboardingClientHeaders(),
    });
}
