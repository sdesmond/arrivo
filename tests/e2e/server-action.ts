import type { Page, Response } from "@playwright/test";

const SERVER_ACTION_TIMEOUT_MS = 5_000;

interface WaitForServerActionOptions {
  /** Substring the POST URL must contain, e.g. "/trips/" or "/packing/". */
  pathIncludes: string;
  /** Long enough for a real mutation under load, short enough not to stall a no-op gesture. */
  timeoutMs?: number;
  /**
   * Whether the POST must actually happen. Default true: no response, or a non-2xx one, throws.
   * Pass false only where the gesture is legitimately allowed to be a no-op — a keyboard move that
   * lands back in its original position fires no POST at all, and those call sites retry.
   */
  required?: boolean;
}

/**
 * Waits for the POST a Next.js server action fires. Server actions POST back to the current page
 * URL rather than a dedicated endpoint, so callers scope by `pathIncludes` — which also means a
 * different action posting concurrently would match, so arm this only around a single interaction.
 *
 * Arm it BEFORE the gesture that triggers the action (mouse.up / Enter) and await it AFTER, so the
 * transaction commits and revalidatePath runs before a later reload can out-race persistence.
 *
 * By default a missing or failed POST throws here, at the gesture, rather than surfacing later as a
 * confusing post-reload order mismatch. `required: false` opts out for genuinely-optional gestures.
 */
export function waitForServerActionResponse(
  page: Page,
  { pathIncludes, timeoutMs = SERVER_ACTION_TIMEOUT_MS, required = true }: WaitForServerActionOptions
): Promise<Response | null> {
  const pending = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().includes(pathIncludes),
    { timeout: timeoutMs }
  );

  if (!required) return pending.catch(() => null);

  return pending.then((response) => {
    if (!response.ok()) {
      throw new Error(`Server action POST to ${response.url()} failed with status ${response.status()}.`);
    }
    return response;
  });
}
