type Refresh = () => Promise<void>;
interface PendingRefresh {
  refresh: Refresh;
  resolve: () => void;
  reject: (error: unknown) => void;
}
/** Runs router transitions one at a time, including requests made while a prior transition is pending. */
export function createRefreshCoordinator() {
  const queue: PendingRefresh[] = [];
  let running = false;
  function advance(): void {
    if (running) return;
    const next = queue.shift();
    if (!next) return;
    running = true;
    let result: Promise<void>;
    try {
      result = next.refresh();
    } catch (error) {
      result = Promise.reject(error);
    }
    void result.then(next.resolve, next.reject).finally(() => {
      running = false;
      advance();
    });
  }
  return (refresh: Refresh): Promise<void> =>
    new Promise((resolve, reject) => {
      queue.push({ refresh, resolve, reject });
      advance();
    });
}
export const coordinateRefresh = createRefreshCoordinator();
