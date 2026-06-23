import { describe, expect, it } from "vitest";
import { formatCurrentSummaryEventTime, formatSummaryEventTime } from "./active-trip-summary-time";

describe("formatSummaryEventTime", () => {
  it("returns end-time copy for a current event", () => {
    expect(formatCurrentSummaryEventTime("2026-05-13T12:30:00.000Z")).toBe("Ends at 12:30 PM");
  });

  it("returns end-time fallback copy when end time is missing", () => {
    expect(formatCurrentSummaryEventTime()).toBe("Ends at —");
  });

  it("returns time only for same-day events", () => {
    expect(formatSummaryEventTime("2026-05-13T14:00:00.000Z", new Date("2026-05-13T12:00:00.000Z"))).toBe("2:00 PM");
  });

  it("returns weekday and time for future-day events", () => {
    expect(formatSummaryEventTime("2026-05-14T14:00:00.000Z", new Date("2026-05-13T12:00:00.000Z"))).toBe(
      "Thursday · 2:00 PM"
    );
  });
});
