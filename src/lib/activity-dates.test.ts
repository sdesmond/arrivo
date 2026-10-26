import { describe, expect, it } from "vitest";
import { dayToInstant, formatInstant, instantToDay } from "./activity-dates";

describe("dayToInstant", () => {
  it("returns UTC day edges for UTC", () => {
    expect(dayToInstant("2026-10-26", "UTC", "start")).toBe("2026-10-26T00:00:00.000Z");
    expect(dayToInstant("2026-10-26", "UTC", "end")).toBe("2026-10-26T23:59:59.999Z");
  });

  it("returns the local day edges for a zone ahead of and behind UTC", () => {
    expect(dayToInstant("2026-10-26", "Asia/Tokyo", "start")).toBe("2026-10-25T15:00:00.000Z");
    expect(dayToInstant("2026-10-26", "America/Denver", "end")).toBe("2026-10-27T05:59:59.999Z");
  });

  it("follows daylight saving changes inside the day", () => {
    // Denver ends DST on 2026-11-01: that local day is 25 hours long.
    expect(dayToInstant("2026-11-01", "America/Denver", "start")).toBe("2026-11-01T06:00:00.000Z");
    expect(dayToInstant("2026-11-01", "America/Denver", "end")).toBe("2026-11-02T06:59:59.999Z");
  });

  it("rejects malformed and impossible days", () => {
    expect(dayToInstant("", "UTC", "start")).toBeUndefined();
    expect(dayToInstant("26/10/2026", "UTC", "start")).toBeUndefined();
    expect(dayToInstant("2026-02-31", "UTC", "start")).toBeUndefined();
  });
});

describe("instantToDay", () => {
  it("maps an instant to the calendar day in the zone", () => {
    expect(instantToDay("2026-10-26T03:00:00.000Z", "America/Denver")).toBe("2026-10-25");
    expect(instantToDay("2026-10-26T03:00:00.000Z", "UTC")).toBe("2026-10-26");
  });

  it("is empty for missing or unreadable input", () => {
    expect(instantToDay(undefined, "UTC")).toBe("");
    expect(instantToDay("nope", "UTC")).toBe("");
  });
});

describe("formatInstant", () => {
  it("formats in the zone with its short name", () => {
    expect(formatInstant("2026-10-25T14:03:07.000Z", "UTC")).toBe("2026-10-25 14:03:07 UTC");
    expect(formatInstant("2026-10-25T14:03:07.000Z", "America/Denver")).toBe("2026-10-25 08:03:07 MDT");
  });
});
