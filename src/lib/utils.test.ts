import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  createRandomId,
  getTripStatus,
  isEventPast,
  isEventNow,
  getDisplayedTripDays,
  getTripDays,
  getActiveDayNumber,
  getWallClockDateKey,
  getTodayDisplay,
  formatTripDate,
  detectDefaultDateFormat,
  detectPreferredCurrency,
  formatDate,
  combineDateAndTimeToIso,
  toHHMM,
  toLocalDateKey,
  inferDocKind,
  formatFileSize,
  shareDoc,
  pluralize,
  parseGraphicCover,
  deriveGraphicCover,
  extractCity,
  getLocationDisplayLabel,
  GRAPHIC_COVER_COLORS,
  GRAPHIC_COVER_ICONS,
  formatCurrency,
  formatDistance,
} from "@/lib/utils";

const NOW = new Date("2026-05-13T12:00:00"); // local noon — for date-based functions
const NOW_UTC = new Date("2026-05-13T12:00:00Z"); // UTC noon — for event time comparisons

describe("cn", () => {
  it("merges classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("deduplicates tailwind conflicts", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });
});

describe("getTripStatus", () => {
  it("upcoming when now is before startDate", () => {
    expect(getTripStatus("2026-06-01", "2026-06-10", NOW)).toBe("upcoming");
  });

  it("past when now is after endDate", () => {
    expect(getTripStatus("2026-04-01", "2026-04-10", NOW)).toBe("past");
  });

  it("active when now is between startDate and endDate", () => {
    expect(getTripStatus("2026-05-01", "2026-05-31", NOW)).toBe("active");
  });

  it("active on startDate boundary", () => {
    expect(getTripStatus("2026-05-13", "2026-05-31", NOW)).toBe("active");
  });

  it("active on endDate boundary", () => {
    expect(getTripStatus("2026-05-01", "2026-05-13", NOW)).toBe("active");
  });

  it("upcoming when dates are undefined", () => {
    expect(getTripStatus(undefined, undefined, NOW)).toBe("upcoming");
  });

  it("upcoming when dates are null", () => {
    expect(getTripStatus(null, null, NOW)).toBe("upcoming");
  });
});

describe("isEventPast", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("past when endAt is before now", () => {
    expect(isEventPast({ endAt: "2026-05-13T10:00:00Z" }, NOW_UTC)).toBe(true);
  });

  it("not past when endAt is after now", () => {
    expect(isEventPast({ endAt: "2026-05-13T14:00:00Z" }, NOW_UTC)).toBe(false);
  });

  it("not past when endAt is missing", () => {
    expect(isEventPast({}, NOW_UTC)).toBe(false);
  });

  it("compares the viewer's local wall clock, not now's real UTC offset", () => {
    process.env.TZ = "America/Denver";
    // Constructed from local components, so this represents 14:30 on the viewer's own clock face
    // regardless of what real UTC offset America/Denver happens to be.
    const now = new Date(2026, 4, 13, 14, 30, 0);
    expect(isEventPast({ endAt: "2026-05-13T10:00:00Z" }, now)).toBe(true);
    expect(isEventPast({ endAt: "2026-05-13T16:00:00Z" }, now)).toBe(false);
  });
});

describe("isEventNow", () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = "UTC";
  });

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("active when now is between startAt and endAt", () => {
    expect(isEventNow({ startAt: "2026-05-13T10:00:00Z", endAt: "2026-05-13T14:00:00Z" }, NOW_UTC)).toBe(true);
  });

  it("not active when now is before startAt", () => {
    expect(isEventNow({ startAt: "2026-05-13T13:00:00Z", endAt: "2026-05-13T15:00:00Z" }, NOW_UTC)).toBe(false);
  });

  it("not active when now is after endAt", () => {
    expect(isEventNow({ startAt: "2026-05-13T09:00:00Z", endAt: "2026-05-13T11:00:00Z" }, NOW_UTC)).toBe(false);
  });

  it("not active when startAt is missing", () => {
    expect(isEventNow({ endAt: "2026-05-13T14:00:00Z" }, NOW_UTC)).toBe(false);
  });

  it("not active when endAt is missing", () => {
    expect(isEventNow({ startAt: "2026-05-13T10:00:00Z" }, NOW_UTC)).toBe(false);
  });

  it("not active when both fields are missing", () => {
    expect(isEventNow({}, NOW_UTC)).toBe(false);
  });

  it("compares the viewer's local wall clock, not now's real UTC offset", () => {
    process.env.TZ = "America/Denver";
    const now = new Date(2026, 4, 13, 14, 30, 0);
    expect(isEventNow({ startAt: "2026-05-13T10:00:00Z", endAt: "2026-05-13T16:00:00Z" }, now)).toBe(true);
    expect(isEventNow({ startAt: "2026-05-13T15:00:00Z", endAt: "2026-05-13T16:00:00Z" }, now)).toBe(false);
  });
});

describe("getTripDays", () => {
  it("single-day trip returns 1", () => {
    expect(getTripDays("2026-05-13", "2026-05-13")).toBe(1);
  });

  it("two-day trip returns 2", () => {
    expect(getTripDays("2026-05-01", "2026-05-02")).toBe(2);
  });

  it("multi-day trip returns correct count", () => {
    expect(getTripDays("2026-05-01", "2026-05-03")).toBe(3);
  });

  it("returns 0 when dates are undefined", () => {
    expect(getTripDays(undefined, undefined)).toBe(0);
  });
});

describe("getDisplayedTripDays", () => {
  it("prefers a supplied dayTotal for dateless trips", () => {
    expect(getDisplayedTripDays({ dayTotal: 3 })).toBe(3);
  });

  it("falls back to date-derived counts when dayTotal is absent", () => {
    expect(getDisplayedTripDays({ startDate: "2026-05-01", endDate: "2026-05-03" })).toBe(3);
  });
});

describe("getWallClockDateKey", () => {
  it("returns the local wall-clock date, not the UTC date", () => {
    // Late-evening local instant. Built with the local Date constructor so the
    // assertion is timezone-invariant: the wall-clock date is May 13 regardless
    // of the runtime zone, whereas toISOString() would roll forward west of UTC.
    const lateEvening = new Date(2026, 4, 13, 23, 30);
    expect(getWallClockDateKey(lateEvening)).toBe("2026-05-13");
  });

  it("zero-pads single-digit months and days", () => {
    expect(getWallClockDateKey(new Date(2026, 0, 5, 9, 0))).toBe("2026-01-05");
  });
});

describe("getActiveDayNumber", () => {
  it("returns 1 on startDate", () => {
    const now = new Date("2026-05-13T12:00:00");
    expect(getActiveDayNumber("2026-05-13", now)).toBe(1);
  });

  it("returns 2 on the day after startDate", () => {
    const now = new Date("2026-05-14T12:00:00");
    expect(getActiveDayNumber("2026-05-13", now)).toBe(2);
  });

  it("returns 0 before trip starts", () => {
    const now = new Date("2026-05-12T12:00:00");
    expect(getActiveDayNumber("2026-05-13", now)).toBe(0);
  });
});

describe("getTodayDisplay", () => {
  it("returns correct date number and month", () => {
    const now = new Date("2026-05-13T12:00:00");
    const result = getTodayDisplay(now);
    expect(result.date).toBe(13);
    expect(result.month).toBe("May");
  });

  it("returns abbreviated month", () => {
    const now = new Date("2026-04-01T00:00:00");
    const result = getTodayDisplay(now);
    expect(result.month).toBe("Apr");
  });
});

describe("formatTripDate", () => {
  it("formats ISO date to readable string", () => {
    expect(formatTripDate("2026-04-24")).toBe("Apr 24, 2026");
  });

  it("handles first of the month", () => {
    expect(formatTripDate("2026-01-01")).toBe("Jan 1, 2026");
  });
});

describe("detectDefaultDateFormat", () => {
  it("returns MM/DD/YYYY for en-US", () => {
    expect(detectDefaultDateFormat("en-US,en;q=0.9")).toBe("MM/DD/YYYY");
  });

  it("returns MM/DD/YYYY for en-PH", () => {
    expect(detectDefaultDateFormat("en-PH")).toBe("MM/DD/YYYY");
  });

  it("returns DD/MM/YYYY for en-GB", () => {
    expect(detectDefaultDateFormat("en-GB,en;q=0.9")).toBe("DD/MM/YYYY");
  });

  it("returns DD/MM/YYYY for fr-FR", () => {
    expect(detectDefaultDateFormat("fr-FR")).toBe("DD/MM/YYYY");
  });

  it("returns DD/MM/YYYY for plain en (no region)", () => {
    expect(detectDefaultDateFormat("en")).toBe("DD/MM/YYYY");
  });

  it("returns DD/MM/YYYY for empty string", () => {
    expect(detectDefaultDateFormat("")).toBe("DD/MM/YYYY");
  });
});

describe("detectPreferredCurrency", () => {
  it("returns USD for en-US", () => {
    expect(detectPreferredCurrency("en-US,en;q=0.9")).toBe("USD");
  });

  it("returns EUR for fr-FR", () => {
    expect(detectPreferredCurrency("fr-FR")).toBe("EUR");
  });

  it("returns GBP for en-GB", () => {
    expect(detectPreferredCurrency("en-GB,en;q=0.9")).toBe("GBP");
  });

  it("returns JPY for ja-JP", () => {
    expect(detectPreferredCurrency("ja-JP")).toBe("JPY");
  });

  it("falls back to USD for plain language without region", () => {
    expect(detectPreferredCurrency("en")).toBe("USD");
  });

  it("falls back to USD for empty string", () => {
    expect(detectPreferredCurrency("")).toBe("USD");
  });
});

describe("formatDate", () => {
  it("formats as MM/DD/YYYY (month-first readable)", () => {
    expect(formatDate("2026-04-24", "MM/DD/YYYY")).toBe("Apr 24, 2026");
  });

  it("formats as DD/MM/YYYY (day-first readable)", () => {
    expect(formatDate("2026-04-24", "DD/MM/YYYY")).toBe("24 Apr 2026");
  });

  it("handles single-digit day without leading zero", () => {
    expect(formatDate("2026-01-05", "DD/MM/YYYY")).toBe("5 Jan 2026");
  });
});

describe("formatCurrency", () => {
  it("formats positive amounts correctly", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
  });

  it("formats zero as $0.00", () => {
    expect(formatCurrency(0, "USD")).toBe("$0.00");
  });

  it("handles non-finite amounts gracefully", () => {
    expect(formatCurrency(NaN, "USD")).toBe("USD ??");
    expect(formatCurrency(Infinity, "USD")).toBe("USD ??");
  });

  it("handles unknown currency codes with fallback", () => {
    expect(formatCurrency(10, "XXXX")).toBe("XXXX 10.00");
  });
});

describe("formatDistance", () => {
  it("shows meters below 1 km", () => {
    expect(formatDistance(650)).toBe("650 m");
  });

  it("shows one decimal place below 10 km", () => {
    expect(formatDistance(1250)).toBe("1.3 km");
  });

  it("shows no decimal places at or above 10 km", () => {
    expect(formatDistance(12340)).toBe("12 km");
  });
});

describe("combineDateAndTimeToIso", () => {
  it("literal-tags the input digits as UTC, independent of the runtime's local offset", () => {
    expect(combineDateAndTimeToIso("2026-05-19", "09:05")).toBe("2026-05-19T09:05:00.000Z");
  });

  it("returns undefined when date is missing", () => {
    expect(combineDateAndTimeToIso(undefined, "09:05")).toBeUndefined();
  });

  it("returns undefined when time is missing", () => {
    expect(combineDateAndTimeToIso("2026-05-19", undefined)).toBeUndefined();
  });

  it("returns undefined when both are missing", () => {
    expect(combineDateAndTimeToIso(undefined, undefined)).toBeUndefined();
  });
});

describe("toHHMM", () => {
  it("formats an ISO datetime to HH:mm using the literal UTC digits", () => {
    expect(toHHMM("2026-05-19T09:05:00.000Z")).toBe("09:05");
  });

  it("zero-pads single-digit hours and minutes", () => {
    expect(toHHMM("2026-01-01T03:07:00.000Z")).toBe("03:07");
  });

  it("returns empty string for an invalid date string", () => {
    expect(toHHMM("not-a-date")).toBe("");
  });

  it("returns empty string for an empty string", () => {
    expect(toHHMM("")).toBe("");
  });
});

describe("toLocalDateKey", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("formats a date well within the local day as YYYY-MM-DD", () => {
    process.env.TZ = "America/Denver";
    expect(toLocalDateKey("2026-04-24T20:05:00.000Z")).toBe("2026-04-24");
  });

  it("rolls a late-evening local time back from the UTC date", () => {
    // 8:05 PM Denver (UTC-6) on Apr 24 serializes to 2:05 AM UTC on Apr 25
    process.env.TZ = "America/Denver";
    expect(toLocalDateKey("2026-04-25T02:05:00.000Z")).toBe("2026-04-24");
  });

  it("rolls an early-morning UTC time forward to the next local date in positive-offset zones", () => {
    process.env.TZ = "Pacific/Auckland";
    expect(toLocalDateKey("2026-04-24T20:05:00.000Z")).toBe("2026-04-25");
  });

  it("zero-pads single-digit months and days", () => {
    process.env.TZ = "UTC";
    expect(toLocalDateKey("2026-01-05T00:00:00.000Z")).toBe("2026-01-05");
  });
});

describe("inferDocKind", () => {
  it("returns pdf for application/pdf", () => {
    expect(inferDocKind("application/pdf")).toBe("pdf");
  });

  it("returns image for image/jpeg", () => {
    expect(inferDocKind("image/jpeg")).toBe("image");
  });

  it("returns image for image/png", () => {
    expect(inferDocKind("image/png")).toBe("image");
  });

  it("returns image for image/webp", () => {
    expect(inferDocKind("image/webp")).toBe("image");
  });

  it("returns image for image/heic", () => {
    expect(inferDocKind("image/heic")).toBe("image");
  });

  it("returns doc for unknown mime type", () => {
    expect(inferDocKind("application/msword")).toBe("doc");
  });

  it("returns doc for text/plain", () => {
    expect(inferDocKind("text/plain")).toBe("doc");
  });

  it("returns doc for empty string", () => {
    expect(inferDocKind("")).toBe("doc");
  });
});

describe("formatFileSize", () => {
  it("formats bytes under 1 MB as KB", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("formats 1.5 KB correctly", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats exactly 1 MB as 1.0 MB", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats 1.2 MB correctly", () => {
    expect(formatFileSize(Math.round(1024 * 1024 * 1.2))).toBe("1.2 MB");
  });

  it("formats large files in MB", () => {
    expect(formatFileSize(1024 * 1024 * 5)).toBe("5.0 MB");
  });
});

describe("shareDoc", () => {
  const doc = { name: "Boarding Pass.pdf", url: "https://example.com/doc.pdf" };

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      delete (navigator as unknown as Record<string, unknown>).clipboard;
    } catch {}
  });

  it("calls navigator.share when available", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      configurable: true,
    });

    await shareDoc(doc);

    expect(mockShare).toHaveBeenCalledWith({
      title: "Boarding Pass.pdf",
      url: "https://example.com/doc.pdf",
    });

    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  it("falls back to clipboard.writeText when navigator.share is unavailable", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      configurable: true,
    });

    await shareDoc(doc);

    expect(mockWriteText).toHaveBeenCalledWith("https://example.com/doc.pdf");
  });

  it("uses empty string for url when doc.url is undefined", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      configurable: true,
    });

    await shareDoc({ name: "No URL Doc" });

    expect(mockWriteText).toHaveBeenCalledWith("");
  });

  it("silently catches AbortError from navigator.share (user cancelled)", async () => {
    const abortError = new DOMException("Cancelled", "AbortError");
    Object.defineProperty(navigator, "share", {
      value: vi.fn().mockRejectedValue(abortError),
      configurable: true,
    });

    await expect(shareDoc(doc)).resolves.toBeUndefined();

    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });

  it("silently catches clipboard permission errors", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError")) },
      configurable: true,
    });

    await expect(shareDoc(doc)).resolves.toBeUndefined();
  });
});

describe("parseGraphicCover", () => {
  it("returns color, pattern and icon for 3-segment graphic URL", () => {
    expect(parseGraphicCover("graphic:oklch(0.7 0.15 200)/horizontal/plane")).toEqual({
      color: "oklch(0.7 0.15 200)",
      pattern: "horizontal",
      icon: "plane",
    });
  });

  it("defaults to slanted pattern for legacy 2-segment URLs", () => {
    expect(parseGraphicCover("graphic:#3b82f6/map-pin")).toEqual({
      color: "#3b82f6",
      pattern: "slanted",
      icon: "map-pin",
    });
  });

  it("handles icon names with hyphens", () => {
    expect(parseGraphicCover("graphic:oklch(0.7 0.15 200)/dots/map-pin")).toEqual({
      color: "oklch(0.7 0.15 200)",
      pattern: "dots",
      icon: "map-pin",
    });
  });

  it("returns null for non-graphic URL", () => {
    expect(parseGraphicCover("https://example.com/img.jpg")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseGraphicCover("")).toBeNull();
  });

  it("returns null for malformed graphic URL without slash", () => {
    expect(parseGraphicCover("graphic:coloronly")).toBeNull();
  });

  it("returns null for graphic URL with empty color", () => {
    expect(parseGraphicCover("graphic:/plane")).toBeNull();
  });

  it("returns null for graphic URL with empty icon", () => {
    expect(parseGraphicCover("graphic:blue/")).toBeNull();
  });
});

describe("deriveGraphicCover", () => {
  it("returns a graphic cover string", () => {
    expect(deriveGraphicCover("Tokyo")).toMatch(/^graphic:.+\/.+$/);
  });

  it("is deterministic for the same title", () => {
    expect(deriveGraphicCover("Paris")).toBe(deriveGraphicCover("Paris"));
  });

  it("produces different results for different titles", () => {
    expect(deriveGraphicCover("Tokyo")).not.toBe(deriveGraphicCover("Paris"));
  });

  it("returns a valid color from the palette", () => {
    const parsed = parseGraphicCover(deriveGraphicCover("London"));
    expect(parsed).not.toBeNull();
    expect(GRAPHIC_COVER_COLORS).toContain(parsed!.color);
  });

  it("returns a valid icon from the palette", () => {
    const parsed = parseGraphicCover(deriveGraphicCover("New York"));
    expect(parsed).not.toBeNull();
    expect(GRAPHIC_COVER_ICONS).toContain(parsed!.icon);
  });

  it("handles empty titles without throwing", () => {
    expect(() => deriveGraphicCover("")).not.toThrow();
  });
});

describe("pluralize", () => {
  it("returns singular for count 1 with regular noun", () => {
    expect(pluralize(1, "trip")).toBe("trip");
  });

  it("returns plural for count 0", () => {
    expect(pluralize(0, "trip")).toBe("trips");
  });

  it("returns plural for count 2", () => {
    expect(pluralize(2, "trip")).toBe("trips");
  });

  it("returns plural for count greater than 1", () => {
    expect(pluralize(100, "day")).toBe("days");
  });

  it("accepts a custom plural form", () => {
    expect(pluralize(1, "stop", "stops")).toBe("stop");
    expect(pluralize(3, "stop", "stops")).toBe("stops");
  });

  it("handles uppercase singular", () => {
    expect(pluralize(1, "TRIP")).toBe("TRIP");
    expect(pluralize(2, "TRIP")).toBe("TRIPs");
  });

  it("handles words ending in s like 'docs'", () => {
    expect(pluralize(1, "doc", "docs")).toBe("doc");
    expect(pluralize(2, "doc", "docs")).toBe("docs");
  });
});

describe("extractCity", () => {
  it("returns the first comma-separated segment", () => {
    expect(extractCity("Branson, Missouri, United States")).toBe("Branson");
  });

  it("returns the full string when there is no comma", () => {
    expect(extractCity("Tokyo")).toBe("Tokyo");
  });

  it("returns empty string for null", () => {
    expect(extractCity(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(extractCity(undefined)).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(extractCity("")).toBe("");
  });

  it("trims whitespace from the result", () => {
    expect(extractCity("  Paris , France")).toBe("Paris");
  });
});

describe("getLocationDisplayLabel", () => {
  it("prefers a saved place name when present", () => {
    expect(getLocationDisplayLabel("JFK Airport", "Queens, NY 11430")).toBe("JFK Airport");
  });

  it("falls back to the address when there is no saved place name", () => {
    expect(getLocationDisplayLabel(undefined, "Paris, France")).toBe("Paris, France");
  });

  it("returns an empty string when neither value is available", () => {
    expect(getLocationDisplayLabel(undefined, undefined)).toBe("");
  });
});

describe("createRandomId", () => {
  const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delegates to crypto.randomUUID when the browser provides it", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("11111111-1111-4111-8111-111111111111");

    expect(createRandomId()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("falls back to a v4 UUID from getRandomValues outside a secure context", () => {
    // Plain-HTTP pages (e.g. a LAN IP) expose crypto.getRandomValues but not crypto.randomUUID.
    vi.stubGlobal("crypto", { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });

    const first = createRandomId();
    const second = createRandomId();

    expect(first).toMatch(uuidV4Pattern);
    expect(second).toMatch(uuidV4Pattern);
    expect(first).not.toBe(second);
  });
});
