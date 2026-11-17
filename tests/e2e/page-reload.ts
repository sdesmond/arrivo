import type { Page, Response } from "@playwright/test";

const RELOAD_ATTEMPTS = 3;

/**
 * Reloads the page, absorbing the abort Next's router causes when the reload cancels an in-flight RSC request.
 *
 * Steps often reload right after a mutation, while `router.refresh()` requests are still open. The reload cancels
 * them, and when an RSC fetch throws Next falls back to a hard navigation to the same URL
 * (`fetch-server-response.js`, "Falling back to browser navigation"). That navigation replaces Playwright's reload,
 * which then rejects with `net::ERR_ABORTED`. The fallback is itself a full load of the URL being reloaded, so
 * reloading again gives the step the fresh document it asked for. Other failures are not retried.
 */
export async function reloadPage(page: Page): Promise<Response | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.reload();
    } catch (error) {
      if (attempt >= RELOAD_ATTEMPTS || !(error instanceof Error) || !error.message.includes("net::ERR_ABORTED")) {
        throw error;
      }
    }
  }
}
