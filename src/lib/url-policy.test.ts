import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_URL_LENGTH,
  assertValidCoverImageUrl,
  assertValidDocumentUrl,
  assertValidPhotographerUrl,
  isHttpUrl,
  isValidCoverImageUrl,
  isValidDocumentUrl,
  parseOwnStorageUrl,
} from "./url-policy";

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TRIP_ID = "22222222-2222-4222-8222-222222222222";

describe("isHttpUrl", () => {
  it.each(["https://images.unsplash.com/photo-1?w=800", "http://example.com/a.pdf", "HTTPS://EXAMPLE.COM/x"])(
    "accepts %s",
    (value) => {
      expect(isHttpUrl(value)).toBe(true);
    }
  );

  it.each([
    "",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example/pixel.png",
    "/relative/path.png",
    "https://exa mple.com/with space",
    "not a url",
    "https://",
  ])("rejects %j", (value) => {
    expect(isHttpUrl(value)).toBe(false);
  });

  it("rejects URLs longer than the cap", () => {
    const longUrl = `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`;
    expect(isHttpUrl(longUrl)).toBe(false);
  });
});

describe("parseOwnStorageUrl", () => {
  it("parses an upload URL into scope, owner and filename", () => {
    expect(parseOwnStorageUrl(`/api/storage/trip-covers/${TRIP_ID}/abc.jpg`)).toEqual({
      scope: "trip-cover",
      ownerId: TRIP_ID,
      filename: "abc.jpg",
    });
  });

  it.each([
    "https://example.com/api/storage/trip-covers/x/y.jpg",
    "/api/storage/../outside.txt",
    "/api/storage/trip-covers/../../outside.txt",
    "/api/storage/trip-covers/x/..",
    "/api/storage/unknown-scope/x/y.jpg",
    "/api/storage/trip-covers/x",
    "/api/storage/trip-covers/x/y/z.jpg",
    "/api/storage/trip-covers/x\\y/z.jpg",
    "/uploads/legacy.pdf",
  ])("returns null for %j", (value) => {
    expect(parseOwnStorageUrl(value)).toBeNull();
  });
});

describe("isValidCoverImageUrl", () => {
  it("accepts http(s) image URLs", () => {
    expect(isValidCoverImageUrl("https://images.unsplash.com/photo-1")).toBe(true);
  });

  it("accepts known graphic covers, with or without a pattern", () => {
    expect(isValidCoverImageUrl("graphic:var(--color-indigo-400)/dots/plane")).toBe(true);
    expect(isValidCoverImageUrl("graphic:var(--color-indigo-400)/plane")).toBe(true);
  });

  it.each([
    "graphic:red;background:url(https://evil.example)/dots/plane",
    "graphic:var(--color-indigo-400)/dots/not-an-icon",
    "graphic:var(--color-indigo-400)/not-a-pattern/plane",
    "graphic:var(--color-indigo-400)/dots/plane/extra",
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:image/svg+xml,<svg/>",
    "//evil.example/pixel.png",
    "",
  ])("rejects %j", (value) => {
    expect(isValidCoverImageUrl(value, TRIP_ID)).toBe(false);
  });

  it("accepts a cover stored for the same trip", () => {
    expect(isValidCoverImageUrl(`/api/storage/trip-covers/${TRIP_ID}/abc.jpg`, TRIP_ID)).toBe(true);
  });

  it("rejects stored covers of another trip, other scopes, or when no trip is given", () => {
    expect(isValidCoverImageUrl(`/api/storage/trip-covers/${OTHER_TRIP_ID}/abc.jpg`, TRIP_ID)).toBe(false);
    expect(isValidCoverImageUrl(`/api/storage/trip-documents/${TRIP_ID}/abc.pdf`, TRIP_ID)).toBe(false);
    expect(isValidCoverImageUrl(`/api/storage/trip-covers/${TRIP_ID}/abc.jpg`)).toBe(false);
  });
});

describe("E2E stub cover images", () => {
  const stubCover = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}`;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the offline Unsplash stub only when E2E_MODE is on", () => {
    vi.stubEnv("E2E_MODE", "true");
    expect(isValidCoverImageUrl(stubCover)).toBe(true);
  });

  it.each(["false", ""])("rejects it when E2E_MODE is %j", (mode) => {
    vi.stubEnv("E2E_MODE", mode);
    expect(isValidCoverImageUrl(stubCover)).toBe(false);
  });

  it("still rejects other data URLs and oversize stubs in E2E mode", () => {
    vi.stubEnv("E2E_MODE", "true");
    expect(isValidCoverImageUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isValidCoverImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isValidCoverImageUrl(`${stubCover}${"a".repeat(4096)}`)).toBe(false);
  });
});

describe("assertValidCoverImageUrl", () => {
  it("throws a readable error for invalid values and passes valid ones", () => {
    expect(() => assertValidCoverImageUrl("javascript:alert(1)", TRIP_ID)).toThrow("Invalid cover image URL.");
    expect(() => assertValidCoverImageUrl("https://images.unsplash.com/photo-1", TRIP_ID)).not.toThrow();
  });
});

describe("isValidDocumentUrl", () => {
  it("accepts http(s) links", () => {
    expect(isValidDocumentUrl("https://example.com/doc.pdf", { tripId: TRIP_ID })).toBe(true);
  });

  it("accepts stored documents owned by the given trip or event", () => {
    expect(isValidDocumentUrl(`/api/storage/trip-documents/${TRIP_ID}/a.pdf`, { tripId: TRIP_ID })).toBe(true);
    expect(
      isValidDocumentUrl("/api/storage/event-documents/event-1/a.pdf", { tripId: TRIP_ID, eventId: "event-1" })
    ).toBe(true);
  });

  it("rejects another owner's stored file, covers, avatars and unsafe schemes", () => {
    expect(isValidDocumentUrl(`/api/storage/trip-documents/${OTHER_TRIP_ID}/a.pdf`, { tripId: TRIP_ID })).toBe(false);
    expect(
      isValidDocumentUrl("/api/storage/event-documents/event-2/a.pdf", { tripId: TRIP_ID, eventId: "event-1" })
    ).toBe(false);
    expect(isValidDocumentUrl(`/api/storage/trip-covers/${TRIP_ID}/a.jpg`, { tripId: TRIP_ID })).toBe(false);
    expect(isValidDocumentUrl(`/api/storage/user-avatars/${TRIP_ID}/a.webp`, { tripId: TRIP_ID })).toBe(false);
    expect(isValidDocumentUrl("/api/storage/../x", { tripId: TRIP_ID })).toBe(false);
    expect(isValidDocumentUrl("javascript:alert(1)", { tripId: TRIP_ID })).toBe(false);
  });
});

describe("assertValidDocumentUrl", () => {
  it("throws for invalid values and passes valid ones", () => {
    expect(() => assertValidDocumentUrl("javascript:alert(1)", { tripId: TRIP_ID })).toThrow("Invalid document URL.");
    expect(() => assertValidDocumentUrl("https://example.com/a.pdf", { tripId: TRIP_ID })).not.toThrow();
  });
});

describe("assertValidPhotographerUrl", () => {
  it("allows http(s) and rejects everything else", () => {
    expect(() => assertValidPhotographerUrl("https://unsplash.com/@someone")).not.toThrow();
    expect(() => assertValidPhotographerUrl("javascript:alert(1)")).toThrow("Invalid photographer URL.");
    expect(() => assertValidPhotographerUrl("//evil.example")).toThrow("Invalid photographer URL.");
  });
});
