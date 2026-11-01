import { describe, expect, it } from "vitest";
import { measureMetric } from "./overview-metric";

const now = new Date("2026-10-30T12:00:00.000Z");

describe("measureMetric", () => {
  it("returns an ok metric with the value and ISO checkedAt", async () => {
    await expect(measureMetric(async () => 3, now)).resolves.toEqual({
      status: "ok",
      value: 3,
      checkedAt: "2026-10-30T12:00:00.000Z",
    });
  });

  it("keeps zero as a valid ok value", async () => {
    await expect(measureMetric(async () => 0, now)).resolves.toMatchObject({ status: "ok", value: 0 });
  });

  it("returns unavailable with checkedAt when the read rejects", async () => {
    const result = await measureMetric(async () => {
      throw new Error("db down");
    }, now);
    expect(result).toEqual({ status: "unavailable", checkedAt: "2026-10-30T12:00:00.000Z" });
  });

  it("returns unavailable when the read throws synchronously", async () => {
    const result = await measureMetric(() => {
      throw new Error("boom");
    }, now);
    expect(result.status).toBe("unavailable");
  });

  it("defaults checkedAt to the real clock", async () => {
    const result = await measureMetric(async () => 1);
    expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
  });
});
