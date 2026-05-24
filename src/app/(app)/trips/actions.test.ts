import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: { insert: vi.fn() } }));
vi.mock("@/lib/auth-helpers", () => ({
  requireUser: vi.fn(),
  assertTripAccess: vi.fn(),
}));

import { buildDayRows } from "./create-trip-days";

describe("buildDayRows", () => {
  it("generates one row per date in a range", () => {
    expect(buildDayRows("trip-1", "2026-06-01", "2026-06-03")).toEqual([
      { tripId: "trip-1", dayNumber: 1, date: "2026-06-01", label: "Day 1" },
      { tripId: "trip-1", dayNumber: 2, date: "2026-06-02", label: "Day 2" },
      { tripId: "trip-1", dayNumber: 3, date: "2026-06-03", label: "Day 3" },
    ]);
  });

  it("generates one row when startDate equals endDate", () => {
    expect(buildDayRows("trip-1", "2026-06-01", "2026-06-01")).toEqual([
      { tripId: "trip-1", dayNumber: 1, date: "2026-06-01", label: "Day 1" },
    ]);
  });

  it("generates one row for a start date without an end date", () => {
    expect(buildDayRows("trip-1", "2026-06-01", undefined)).toEqual([
      { tripId: "trip-1", dayNumber: 1, date: "2026-06-01", label: "Day 1" },
    ]);
  });

  it("generates no rows when no start date is provided", () => {
    expect(buildDayRows("trip-1", undefined, undefined)).toEqual([]);
  });

  it("throws for 46+ days", () => {
    expect(() => buildDayRows("trip-1", "2026-06-01", "2026-07-16")).toThrow(/45 days/i);
  });
});
