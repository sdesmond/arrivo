// @vitest-environment node
import { describe, expect, it } from "vitest";
import { seedDate, seedDateTime } from "./seed-dates";

const NOW = new Date("2026-06-15T12:34:56.000Z");

describe("seedDate", () => {
  it("returns the anchor date at offset zero", () => {
    expect(seedDate(0, NOW)).toBe("2026-06-15");
  });

  it("adds a positive offset", () => {
    expect(seedDate(5, NOW)).toBe("2026-06-20");
  });

  it("subtracts for a negative offset", () => {
    expect(seedDate(-2, NOW)).toBe("2026-06-13");
  });

  it("rolls over a month boundary", () => {
    expect(seedDate(20, NOW)).toBe("2026-07-05");
  });

  it("rolls over a year boundary", () => {
    const endOfYear = new Date("2026-12-30T00:00:00.000Z");
    expect(seedDate(5, endOfYear)).toBe("2027-01-04");
  });

  it("is stable across UTC hours within the same day", () => {
    const lateInDay = new Date("2026-06-15T23:59:59.000Z");
    expect(seedDate(0, lateInDay)).toBe("2026-06-15");
  });

  it("defaults now to the current date when omitted", () => {
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = String(today.getUTCMonth() + 1).padStart(2, "0");
    const day = String(today.getUTCDate()).padStart(2, "0");
    expect(seedDate(0)).toBe(`${year}-${month}-${day}`);
  });
});

describe("seedDateTime", () => {
  it("composes the offset date with the given time as UTC", () => {
    expect(seedDateTime(1, "09:30", NOW).toISOString()).toBe("2026-06-16T09:30:00.000Z");
  });

  it("supports a negative offset", () => {
    expect(seedDateTime(-1, "23:45", NOW).toISOString()).toBe("2026-06-14T23:45:00.000Z");
  });
});
