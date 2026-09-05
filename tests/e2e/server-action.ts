import type { Page, Response } from "@playwright/test";

const SERVER_ACTION_TIMEOUT_MS = 5_000;

interface WaitForServerActionOptions {
  /** Substring the POST URL must contain, e.g. "/trips/" or "/packing/". */
  pathIncludes: string;
  /** Long enough for a real mutation under load, short enough not to stall a no-op gesture. */
  timeoutMs?: number;
}

/**
 * Waits for the POST a Next.js server action fires. Server actions POST back to the current page
 * URL rather than a dedicated endpoint, so callers scope by `pathIncludes` — which also means a
 * different action posting concurrently would match, so arm this only around a single interaction.
 *
 * Arm it BEFORE the gesture that triggers the action (mouse.up / Enter) and await it AFTER, so the
 * transaction commits and revalidatePath runs before a later reload can out-race persistence.
 * Resolves to null on timeout rather than throwing — some gestures are legitimate no-ops (a move
 * that lands back in its original position) that fire no POST at all.
 */
export function waitForServerActionResponse(
  page: Page,
  { pathIncludes, timeoutMs = SERVER_ACTION_TIMEOUT_MS }: WaitForServerActionOptions
): Promise<Response | null> {
  return page
    .waitForResponse((response) => response.request().method() === "POST" && response.url().includes(pathIncludes), {
      timeout: timeoutMs,
    })
    .catch(() => null);
}
