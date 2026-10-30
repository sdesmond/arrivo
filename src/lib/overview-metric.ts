// Client-safe contract for Overview metrics: a failed measurement is `unavailable`, never zero or healthy.
export type Metric<T> = { status: "ok"; value: T; checkedAt: string } | { status: "unavailable"; checkedAt: string };

// `now` is the real clock (not getNow()): checkedAt reports when the measurement actually ran.
export async function measureMetric<T>(read: () => Promise<T> | T, now: Date = new Date()): Promise<Metric<T>> {
  try {
    const value = await read();
    return { status: "ok", value, checkedAt: now.toISOString() };
  } catch {
    return { status: "unavailable", checkedAt: now.toISOString() };
  }
}
