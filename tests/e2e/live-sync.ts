import type { Page, Response } from "@playwright/test";

const LIVE_SYNC_READY_TIMEOUT_MS = 30_000;

export function waitForLiveSyncResponse(page: Page, pathname: string): Promise<Response> {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === pathname && response.status() === 200,
    { timeout: LIVE_SYNC_READY_TIMEOUT_MS }
  );
}
