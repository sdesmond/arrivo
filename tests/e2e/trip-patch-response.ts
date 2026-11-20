import type { Page } from "@playwright/test";

/**
 * Waits for the trip PATCH the web app sends to save metadata and dates. Arm it before the gesture and await it after,
 * so the transaction has committed before a reload. A 200 is a save; a 409 is the confirmation preview.
 */
export function waitForTripPatchResponse(page: Page, { timeoutMs = 10_000 }: { timeoutMs?: number } = {}) {
  return page
    .waitForResponse(
      (response) =>
        response.request().method() === "PATCH" && /\/api\/v1\/trips\/[^/]+$/.test(new URL(response.url()).pathname),
      { timeout: timeoutMs }
    )
    .then((response) => {
      if (response.status() !== 200 && response.status() !== 409) {
        throw new Error(`Trip PATCH to ${response.url()} failed with status ${response.status()}.`);
      }
      return response;
    });
}
