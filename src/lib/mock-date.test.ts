// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getNow, setMockDate, getMockDateISO } from "@/lib/mock-date";

const KEY = "__mock_date__";

// Minimal document.cookie implementation backed by an in-memory store.
function makeCookieDocument() {
  const store = new Map<string, string>();
  return {
    get cookie() {
      return Array.from(store.entries())
        .map(([k, val]) => `${k}=${val}`)
        .join("; ");
    },
    set cookie(str: string) {
      const parts = str.split(";").map((segment) => segment.trim());
      const first = parts[0];
      const eqIdx = first.indexOf("=");
      const name = first.slice(0, eqIdx);
      const value = first.slice(eqIdx + 1);
      const maxAgePart = parts.find((part) => /^max-age=/i.test(part));
      const maxAge = maxAgePart ? parseInt(maxAgePart.split("=")[1], 10) : undefined;
      if (maxAge !== undefined && maxAge <= 0) {
        store.delete(name);
      } else {
        store.set(name, value);
      }
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("document", makeCookieDocument());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getNow — server environment (no document)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubEnv("NODE_ENV", "development");
    if ("document" in globalThis) {
      delete (globalThis as Record<string, unknown>).document;
    }
  });

  it("returns real Date when document is undefined in development", () => {
    const result = getNow();
    expect(result).toBeInstanceOf(Date);
  });
});

describe("getNow", () => {
  it("returns real Date when NODE_ENV is not development", () => {
    vi.stubEnv("NODE_ENV", "test");
    const before = Date.now();
    const result = getNow();
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("returns real Date when in development but no cookie is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    const before = Date.now();
    const result = getNow();
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("returns mocked date when cookie is set in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const isoDate = "2026-01-15T00:00:00.000Z";
    document.cookie = `${KEY}=${encodeURIComponent(isoDate)}; path=/`;
    const result = getNow();
    expect(result.toISOString()).toBe(isoDate);
  });
});

describe("getMockDateISO — server environment (no document)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    if ("document" in globalThis) {
      delete (globalThis as Record<string, unknown>).document;
    }
  });

  it("returns null when document is undefined", () => {
    expect(getMockDateISO()).toBeNull();
  });
});

describe("getMockDateISO", () => {
  it("returns null when no cookie is set", () => {
    expect(getMockDateISO()).toBeNull();
  });

  it("returns ISO string when cookie is set", () => {
    const isoDate = "2026-03-10";
    document.cookie = `${KEY}=${encodeURIComponent(isoDate)}; path=/`;
    expect(getMockDateISO()).toBe(isoDate);
  });
});

describe("setMockDate", () => {
  let reloadMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reloadMock = vi.fn();
    vi.stubGlobal("window", { location: { reload: reloadMock } });
  });

  it("sets cookie with provided ISO date", () => {
    const isoDate = "2026-06-01";
    setMockDate(isoDate);
    expect(getMockDateISO()).toBe(isoDate);
  });

  it("clears cookie when called with null", () => {
    document.cookie = `${KEY}=${encodeURIComponent("2026-06-01")}; path=/`;
    setMockDate(null);
    expect(getMockDateISO()).toBeNull();
  });

  it("calls window.location.reload()", () => {
    setMockDate("2026-06-01");
    expect(reloadMock).toHaveBeenCalledOnce();
  });

  it("calls reload even when clearing date", () => {
    setMockDate(null);
    expect(reloadMock).toHaveBeenCalledOnce();
  });
});
