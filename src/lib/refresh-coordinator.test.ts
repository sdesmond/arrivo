import { expect, it, vi } from "vitest";
import { createRefreshCoordinator } from "./refresh-coordinator";
it("serializes refreshes and retains a pending refresh requested during a transition", async () => {
  const coordinate = createRefreshCoordinator();
  let finishFirst: () => void = () => {};
  let finishSecond: () => void = () => {};
  const first = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishFirst = resolve;
      })
  );
  const second = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSecond = resolve;
      })
  );
  const ignored = vi.fn(async () => {});
  const firstDone = coordinate(first);
  const secondDone = coordinate(second);
  const thirdDone = coordinate(ignored);
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
  finishFirst();
  await firstDone;
  await Promise.resolve();
  expect(second).toHaveBeenCalledOnce();
  expect(ignored).not.toHaveBeenCalled();
  finishSecond();
  await Promise.all([secondDone, thirdDone]);
  expect(ignored).toHaveBeenCalledOnce();
});
it("releases the queue after a refresh fails", async () => {
  const coordinate = createRefreshCoordinator();
  const first = coordinate(async () => {
    throw new Error("failed");
  });
  const second = vi.fn(async () => {});
  const pending = coordinate(second);
  await expect(first).rejects.toThrow("failed");
  await pending;
  expect(second).toHaveBeenCalledOnce();
});
