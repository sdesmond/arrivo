import "server-only";

// Per-user request budgets for the routes and actions that spend the server's Mapbox/Unsplash quota. Counts live in
// process memory (fixed windows), so each server instance enforces its own budget: enough to stop one signed-in
// account draining a shared API key, with no table to maintain. Real clock on purpose: the dev date picker must not
// move a window.

export interface RateLimitPolicy {
  max: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  // Typeahead fires on a 300ms debounce, so this leaves room for fast typists and several open forms.
  mapboxSearch: { max: 120, windowMs: 60_000 },
  mapboxStatic: { max: 120, windowMs: 60_000 },
  mapboxRouting: { max: 120, windowMs: 60_000 },
  unsplashSearch: { max: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export type RateLimitResult = { limited: false } | { limited: true; retryAfterSeconds: number };

interface WindowEntry {
  count: number;
  resetAt: number;
}

declare global {
  var __rateLimitWindows: Map<string, WindowEntry> | undefined;
}

const PRUNE_THRESHOLD = 2_000;

// Held on globalThis so hot reloads in dev keep one table (same pattern as the currency cache).
function getWindows(): Map<string, WindowEntry> {
  globalThis.__rateLimitWindows ??= new Map();
  return globalThis.__rateLimitWindows;
}

export function resetRateLimits(): void {
  globalThis.__rateLimitWindows = undefined;
}

export function checkRateLimit(bucket: string, userId: string, policy: RateLimitPolicy): RateLimitResult {
  const windows = getWindows();
  const now = Date.now();

  if (windows.size > PRUNE_THRESHOLD) {
    for (const [key, entry] of windows) {
      if (entry.resetAt <= now) windows.delete(key);
    }
  }

  const key = `${bucket}:${userId}`;
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + policy.windowMs });
    return { limited: false };
  }
  if (existing.count >= policy.max) {
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }
  existing.count += 1;
  return { limited: false };
}

export class RateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests. Try again in a moment.");
    this.name = "RateLimitError";
  }
}

/** For server actions: throws `RateLimitError` once `userId` has spent the bucket's budget. */
export function assertWithinRateLimit(bucket: RateLimitBucket, userId: string): void {
  const result = checkRateLimit(bucket, userId, RATE_LIMITS[bucket]);
  if (result.limited) throw new RateLimitError(result.retryAfterSeconds);
}

/** For route handlers: a 429 to return when the budget is spent, otherwise null. */
export function rateLimitedResponse(bucket: RateLimitBucket, userId: string): Response | null {
  const result = checkRateLimit(bucket, userId, RATE_LIMITS[bucket]);
  if (!result.limited) return null;
  return new Response("Too many requests. Try again in a moment.", {
    status: 429,
    headers: { "Retry-After": String(result.retryAfterSeconds) },
  });
}
