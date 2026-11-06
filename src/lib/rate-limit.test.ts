// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertWithinRateLimit,
  checkRateLimit,
  rateLimitedResponse,
  RateLimitError,
  RATE_LIMITS,
  resetRateLimits,
} from "./rate-limit";

const POLICY = { max: 3, windowMs: 60_000 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T12:00:00Z"));
  resetRateLimits();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows up to the maximum within a window, then blocks with a retry delay", () => {
    for (let call = 0; call < POLICY.max; call += 1) {
      expect(checkRateLimit("bucket", "user-1", POLICY)).toEqual({ limited: false });
    }
    vi.advanceTimersByTime(20_000);
    expect(checkRateLimit("bucket", "user-1", POLICY)).toEqual({ limited: true, retryAfterSeconds: 40 });
  });

  it("opens a new window once the old one has passed", () => {
    for (let call = 0; call < POLICY.max + 1; call += 1) checkRateLimit("bucket", "user-1", POLICY);
    vi.advanceTimersByTime(POLICY.windowMs);
    expect(checkRateLimit("bucket", "user-1", POLICY)).toEqual({ limited: false });
  });

  it("counts each user and each bucket separately", () => {
    for (let call = 0; call < POLICY.max; call += 1) checkRateLimit("bucket", "user-1", POLICY);
    expect(checkRateLimit("bucket", "user-2", POLICY)).toEqual({ limited: false });
    expect(checkRateLimit("other", "user-1", POLICY)).toEqual({ limited: false });
    expect(checkRateLimit("bucket", "user-1", POLICY).limited).toBe(true);
  });

  it("rounds a sub-second wait up to one second", () => {
    for (let call = 0; call < POLICY.max; call += 1) checkRateLimit("bucket", "user-1", POLICY);
    vi.advanceTimersByTime(POLICY.windowMs - 100);
    expect(checkRateLimit("bucket", "user-1", POLICY)).toEqual({ limited: true, retryAfterSeconds: 1 });
  });

  it("drops expired entries so the table cannot grow without bound", () => {
    for (let user = 0; user < 2_100; user += 1) checkRateLimit("bucket", `user-${user}`, POLICY);
    vi.advanceTimersByTime(POLICY.windowMs + 1);
    checkRateLimit("bucket", "fresh", POLICY);
    const store = globalThis.__rateLimitWindows as Map<string, unknown>;
    expect(store.size).toBe(1);
  });
});

describe("assertWithinRateLimit", () => {
  it("passes while under the limit and throws RateLimitError over it", () => {
    for (let call = 0; call < RATE_LIMITS.unsplashSearch.max; call += 1) {
      expect(() => assertWithinRateLimit("unsplashSearch", "user-1")).not.toThrow();
    }
    expect(() => assertWithinRateLimit("unsplashSearch", "user-1")).toThrow(RateLimitError);
    expect(() => assertWithinRateLimit("unsplashSearch", "user-1")).toThrow(/Too many requests/);
  });
});

describe("rateLimitedResponse", () => {
  it("returns null under the limit and a 429 with Retry-After over it", () => {
    for (let call = 0; call < RATE_LIMITS.mapboxStatic.max; call += 1) {
      expect(rateLimitedResponse("mapboxStatic", "user-1")).toBeNull();
    }
    const response = rateLimitedResponse("mapboxStatic", "user-1");
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
