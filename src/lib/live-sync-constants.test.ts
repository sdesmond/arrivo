import { describe, expect, it } from "vitest";
import { LIVE_SYNC_DEAD_CHANNEL_GRACE_MS, SSE_HEARTBEAT_INTERVAL_MS } from "./live-sync-constants";

describe("live-sync constants", () => {
  it("uses the shared heartbeat and dead-channel timings", () => {
    expect(SSE_HEARTBEAT_INTERVAL_MS).toBe(15_000);
    expect(LIVE_SYNC_DEAD_CHANNEL_GRACE_MS).toBe(10_000);
  });
});
