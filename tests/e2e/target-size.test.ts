import { describe, expect, it, vi } from "vitest";
import type { Locator } from "@playwright/test";
import { expectTargetAtLeast44px } from "./target-size";

type Rect = { width: number; height: number };

function fakeControl(evaluate: ReturnType<typeof vi.fn>) {
  return { evaluate, waitFor: vi.fn().mockResolvedValue(undefined) } as unknown as Locator;
}

function rects(...sequence: Array<Rect | Error>) {
  const evaluate = vi.fn();
  for (const step of sequence) {
    if (step instanceof Error) evaluate.mockRejectedValueOnce(step);
    else evaluate.mockResolvedValueOnce(step);
  }
  return evaluate;
}

describe("expectTargetAtLeast44px", () => {
  it("waits for the control to be visible before measuring", async () => {
    const control = fakeControl(rects({ width: 44, height: 44 }));
    await expectTargetAtLeast44px(control);
    expect(control.waitFor).toHaveBeenCalledWith(expect.objectContaining({ state: "visible" }));
  });

  it("passes on the first read when the control is already 44 by 44", async () => {
    const evaluate = rects({ width: 44, height: 44 });
    await expectTargetAtLeast44px(fakeControl(evaluate));
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("re-reads the rect while layout is still reflowing", async () => {
    const evaluate = rects({ width: 0, height: 0 }, { width: 120, height: 20 }, { width: 120, height: 48 });
    await expectTargetAtLeast44px(fakeControl(evaluate));
    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  it("retries when the control is re-mounted between reads", async () => {
    const evaluate = rects(new Error("Element is not attached to the DOM"), { width: 48, height: 48 });
    await expectTargetAtLeast44px(fakeControl(evaluate));
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("ignores width when only the height is checked", async () => {
    const evaluate = rects({ width: 12, height: 44 });
    await expectTargetAtLeast44px(fakeControl(evaluate), { dimensions: "height" });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("fails with the last measured size once layout never settles", async () => {
    const evaluate = vi.fn().mockResolvedValue({ width: 30, height: 48 });
    await expect(expectTargetAtLeast44px(fakeControl(evaluate), { timeout: 300 })).rejects.toThrow(/width/);
    expect(evaluate.mock.calls.length).toBeGreaterThan(1);
  });
});
