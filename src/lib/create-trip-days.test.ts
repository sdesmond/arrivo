import { describe, expect, it } from "vitest";
import { buildDatelessDayRow, buildDayRows } from "./create-trip-days";

describe("buildDatelessDayRow", () => {
  it("returns a single undated first day", () => {
    expect(buildDatelessDayRow("trip-1")).toEqual({ tripId: "trip-1", dayNumber: 1, date: null, label: "Day 1" });
  });
});

describe("buildDayRows", () => {
  it("returns no rows without a start date", () => {
    expect(buildDayRows("trip-1", undefined, "2026-07-03")).toEqual([]);
  });

  it("numbers one day per date, inclusive of both ends", () => {
    expect(buildDayRows("trip-1", "2026-07-01", "2026-07-03")).toEqual([
      { tripId: "trip-1", dayNumber: 1, date: "2026-07-01", label: "Day 1" },
      { tripId: "trip-1", dayNumber: 2, date: "2026-07-02", label: "Day 2" },
      { tripId: "trip-1", dayNumber: 3, date: "2026-07-03", label: "Day 3" },
    ]);
  });

  it("treats a missing end date as a single day", () => {
    expect(buildDayRows("trip-1", "2026-07-01", undefined)).toHaveLength(1);
  });

  it("swaps a reversed range", () => {
    expect(buildDayRows("trip-1", "2026-07-02", "2026-07-01").map((row) => row.date)).toEqual([
      "2026-07-01",
      "2026-07-02",
    ]);
  });

  it("accepts 45 days and rejects 46", () => {
    expect(buildDayRows("trip-1", "2026-07-01", "2026-08-14")).toHaveLength(45);
    expect(() => buildDayRows("trip-1", "2026-07-01", "2026-08-15")).toThrow("Max trip length is 45 days (got 46)");
  });
});
