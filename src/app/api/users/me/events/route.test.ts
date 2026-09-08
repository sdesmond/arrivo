// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, subscribeUser } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  subscribeUser: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser,
}));

// Only subscribeUser is mocked (so tests can grab and manually drive the callback the route wires
// up, the same way a real publish or a real scheduler tick would). createLiveSyncResponse,
// formatSseEvent, and formatSseHeartbeat stay the real trip-events.ts implementations — this route
// now delegates all stream setup to that shared helper, so testing it end to end is what proves
// the route actually wires subscribeUser into it correctly.
vi.mock("@/lib/trip-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trip-events")>();
  return {
    ...actual,
    subscribeUser,
  };
});

import { formatSseEvent, formatSseHeartbeat } from "@/lib/trip-events";
import { GET } from "./route";

async function readNextChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

describe("GET /api/users/me/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    subscribeUser.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("propagates the redirect signal when unauthenticated, before any subscription", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    (redirectSignal as Error & { digest: string }).digest = "NEXT_REDIRECT;push;/sign-in;307;";
    requireUser.mockRejectedValue(redirectSignal);

    await expect(GET(new Request("http://localhost/api/users/me/events") as never)).rejects.toBe(redirectSignal);

    expect(subscribeUser).not.toHaveBeenCalled();
  });

  it("subscribes to the session user's own topic with no trip check", async () => {
    const response = await GET(new Request("http://localhost/api/users/me/events") as never);

    expect(requireUser).toHaveBeenCalled();
    expect(subscribeUser).toHaveBeenCalledWith("user-1", expect.any(Function));
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-store, no-transform");
    expect(response.headers.get("Connection")).toBe("keep-alive");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("flushes an immediate heartbeat on connect, before any interval tick", async () => {
    const response = await GET(new Request("http://localhost/api/users/me/events") as never);
    const reader = response.body!.getReader();

    const chunk = await readNextChunk(reader);
    expect(chunk).toBe(formatSseHeartbeat());
    await reader.cancel().catch(() => {});
  });

  it("streams a published event through to the client", async () => {
    const response = await GET(new Request("http://localhost/api/users/me/events") as never);
    const reader = response.body!.getReader();
    const publish = subscribeUser.mock.calls[0][1] as (event: unknown) => void;

    await readNextChunk(reader); // the immediate connect heartbeat

    const event = { type: "membership-changed", tripId: "trip-1" } as const;
    publish(event);

    const chunk = await readNextChunk(reader);
    expect(chunk).toBe(formatSseEvent(event));
    await reader.cancel().catch(() => {});
  });

  it("emits a heartbeat data event when the scheduler ticks the subscriber it registered", async () => {
    // The heartbeat scheduler in trip-events.ts delivers through this exact subscriber callback —
    // not an independent per-route timer. Driving the callback directly (as the scheduler would)
    // is what proves the route's stream reacts to that path, rather than re-asserting the removed
    // per-route setInterval mechanism.
    const response = await GET(new Request("http://localhost/api/users/me/events") as never);
    const reader = response.body!.getReader();
    const deliver = subscribeUser.mock.calls[0][1] as (frame: unknown) => void;

    await readNextChunk(reader); // the immediate connect heartbeat

    deliver({ type: "heartbeat" });

    const chunk = await readNextChunk(reader);
    expect(chunk).toBe(formatSseHeartbeat());
    await reader.cancel().catch(() => {});
  });

  it("removes the subscriber and closes the stream when the request aborts", async () => {
    const unsubscribe = vi.fn();
    subscribeUser.mockReturnValue(unsubscribe);
    const controller = new AbortController();
    const request = new Request("http://localhost/api/users/me/events", {
      signal: controller.signal,
    }) as never;

    const response = await GET(request);
    const reader = response.body!.getReader();
    await readNextChunk(reader); // the immediate connect heartbeat

    controller.abort();
    await Promise.resolve();
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledOnce();
    const { done } = await reader.read();
    expect(done).toBe(true);
  });

  it("cleans up without enqueueing when authorization finishes after the request already aborted", async () => {
    const unsubscribe = vi.fn();
    subscribeUser.mockReturnValue(unsubscribe);
    const controller = new AbortController();
    const request = new Request("http://localhost/api/users/me/events", {
      signal: controller.signal,
    }) as never;
    controller.abort();

    const response = await GET(request);

    expect(unsubscribe).toHaveBeenCalledOnce();
    const { done } = await response.body!.getReader().read();
    expect(done).toBe(true);
  });
});
