// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, subscribeUser, formatSseEvent, formatSseHeartbeat } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  subscribeUser: vi.fn(),
  formatSseEvent: vi.fn((event: unknown) => `data: ${JSON.stringify(event)}\n\n`),
  formatSseHeartbeat: vi.fn(() => 'data: {"type":"heartbeat"}\n\n'),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser,
}));

vi.mock("@/lib/trip-events", () => ({
  SSE_HEARTBEAT_INTERVAL_MS: 15_000,
  formatSseEvent,
  formatSseHeartbeat,
  subscribeUser,
}));

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

  it("streams a published event through to the client", async () => {
    const response = await GET(new Request("http://localhost/api/users/me/events") as never);
    const reader = response.body!.getReader();
    const publish = subscribeUser.mock.calls[0][1] as (event: unknown) => void;

    const event = { type: "membership-changed", tripId: "trip-1" };
    publish(event);

    const chunk = await readNextChunk(reader);
    expect(chunk).toBe(formatSseEvent(event));
    await reader.cancel().catch(() => {});
  });

  it("emits a heartbeat data event on an idle connection", async () => {
    vi.useFakeTimers();
    const response = await GET(new Request("http://localhost/api/users/me/events") as never);
    const reader = response.body!.getReader();

    vi.advanceTimersByTime(15_000);

    const chunk = await readNextChunk(reader);
    expect(chunk).toBe(formatSseHeartbeat());
    await reader.cancel().catch(() => {});
  });

  it("removes the subscriber and clears the heartbeat interval when the request aborts", async () => {
    const unsubscribe = vi.fn();
    subscribeUser.mockReturnValue(unsubscribe);
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const controller = new AbortController();
    const request = new Request("http://localhost/api/users/me/events", {
      signal: controller.signal,
    }) as never;

    const response = await GET(request);
    const reader = response.body!.getReader();

    controller.abort();
    await Promise.resolve();
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(clearIntervalSpy).toHaveBeenCalled();

    await reader.cancel().catch(() => {});
  });

  it("cleans up when authorization finishes after the request already aborted", async () => {
    const unsubscribe = vi.fn();
    subscribeUser.mockReturnValue(unsubscribe);
    const controller = new AbortController();
    const request = new Request("http://localhost/api/users/me/events", {
      signal: controller.signal,
    }) as never;
    controller.abort();

    await GET(request);

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
