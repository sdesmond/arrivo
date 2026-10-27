// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the work's value and leaves no pending timer", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve("done"), 1_000, "too slow")).resolves.toBe("done");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with the given message once the timeout wins", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => undefined), 1_000, "too slow");
    const assertion = expect(pending).rejects.toThrow("too slow");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates the work's own rejection", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.reject(new Error("boom")), 1_000, "too slow")).rejects.toThrow("boom");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("swallows a rejection that arrives after the timeout won", async () => {
    vi.useFakeTimers();
    let rejectLate: (error: Error) => void = () => undefined;
    const late = new Promise<never>((_resolve, reject) => {
      rejectLate = reject;
    });
    const pending = withTimeout(late, 1_000, "too slow");
    const assertion = expect(pending).rejects.toThrow("too slow");
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    rejectLate(new Error("late"));
    await vi.advanceTimersByTimeAsync(0);
  });
});
