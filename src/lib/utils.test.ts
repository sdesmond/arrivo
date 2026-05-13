import { describe, it, expect } from "vitest";
import {
  cn,
  getTripStatus,
  isEventPast,
  isEventNow,
  getTripDays,
  getActiveDayNumber,
  getTodayDisplay,
  formatTripDate,
} from "@/lib/utils";

const NOW = new Date("2026-05-13T12:00:00");      // local noon — for date-based functions
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
});

describe("isEventPast", () => {
  it("past when endAt is before now", () => {
    expect(isEventPast({ endAt: "2026-05-13T10:00:00Z" }, NOW_UTC)).toBe(true);
  });

  it("not past when endAt is after now", () => {
    expect(isEventPast({ endAt: "2026-05-13T14:00:00Z" }, NOW_UTC)).toBe(false);
  });

  it("not past when endAt is missing", () => {
    expect(isEventPast({}, NOW_UTC)).toBe(false);
  });
});

describe("isEventNow", () => {
  it("active when now is between startAt and endAt", () => {
    expect(
      isEventNow({ startAt: "2026-05-13T10:00:00Z", endAt: "2026-05-13T14:00:00Z" }, NOW_UTC)
    ).toBe(true);
  });

  it("not active when now is before startAt", () => {
    expect(
      isEventNow({ startAt: "2026-05-13T13:00:00Z", endAt: "2026-05-13T15:00:00Z" }, NOW_UTC)
    ).toBe(false);
  });

  it("not active when now is after endAt", () => {
    expect(
      isEventNow({ startAt: "2026-05-13T09:00:00Z", endAt: "2026-05-13T11:00:00Z" }, NOW_UTC)
    ).toBe(false);
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
