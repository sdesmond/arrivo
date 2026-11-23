import { describe, expect, it } from "vitest";
import { validateTarget, summarize } from "./benchmark-template-reorder.mjs";

describe("benchmark guard", () => {
  it("requires explicit confirmation, loopback and a dedicated database name", () => {
    expect(() => validateTarget("postgres://localhost/arrivo_benchmark_test", false)).toThrow();
    expect(() => validateTarget("postgres://remote/arrivo_benchmark_test", true)).toThrow();
    expect(() => validateTarget("postgres://localhost/arrivo", true)).toThrow();
    expect(() => validateTarget("postgres://localhost/arrivo_benchmark_test", true)).not.toThrow();
  });
  it("reports the full timing distribution and deadline and rollback counts", () => {
    expect(
      summarize([
        { elapsedMs: 2, outcome: "committed" },
        { elapsedMs: 5, outcome: "deadline", rolledBack: true },
      ])
    ).toMatchObject({ timesMs: [2, 5], committed: 1, deadlines: 1, rollbacksVerified: 1 });
  });
});

it("rejects connection overrides and summarizes unverified rollbacks distinctly", () => {
  expect(() => validateTarget("postgres://localhost/arrivo_benchmark_test?host=remote", true)).toThrow();
  expect(summarize([{ elapsedMs: 8, outcome: "deadline", rolledBack: false }])).toMatchObject({
    deadlines: 1,
    rollbacksVerified: 0,
  });
});
