import type { Page, Response } from "@playwright/test";

const LIVE_SYNC_READY_TIMEOUT_MS = 30_000;

// For asserting a UI change that a live-sync event should have already propagated, not for the
// initial SSE handshake itself (LIVE_SYNC_READY_TIMEOUT_MS above) — deliberately shorter.
export const LIVE_SYNC_ASSERTION_TIMEOUT_MS = 15_000;

export function waitForLiveSyncResponse(page: Page, pathname: string): Promise<Response> {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === pathname && response.status() === 200,
    { timeout: LIVE_SYNC_READY_TIMEOUT_MS }
  );
}
