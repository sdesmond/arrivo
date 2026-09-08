// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, requireUser, subscribeTripForUser } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  requireUser: vi.fn(),
  subscribeTripForUser: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

// Only subscribeTripForUser is mocked (so tests can grab and manually drive the callback the
// route wires up, the same way a real publish or a real scheduler tick would). createLiveSyncResponse,
// formatSseEvent, and formatSseHeartbeat stay the real trip-events.ts implementations — this route
// now delegates all stream setup to that shared helper, so testing it end to end is what proves
// the route actually wires subscribeTripForUser into it correctly.
vi.mock("@/lib/trip-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trip-events")>();
  return {
    ...actual,
    subscribeTripForUser,
  };
});

import { formatSseEvent, formatSseHeartbeat } from "@/lib/trip-events";
import { GET } from "./route";

function makeParams(tripId: string) {
  return { params: Promise.resolve({ tripId }) };
}

async function readNextChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

describe("GET /api/trips/[tripId]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue("viewer");
    subscribeTripForUser.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("propagates the redirect signal when unauthenticated, before any subscription", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    (redirectSignal as Error & { digest: string }).digest = "NEXT_REDIRECT;push;/sign-in;307;";
    requireUser.mockRejectedValue(redirectSignal);

    await expect(
      GET(new Request("http://localhost/api/trips/trip-1/events") as never, makeParams("trip-1"))
    ).rejects.toBe(redirectSignal);

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(subscribeTripForUser).not.toHaveBeenCalled();
  });

  it("propagates the not-found signal when below viewer access, before any subscription", async () => {
    const notFoundSignal = new Error("NEXT_NOT_FOUND");
    (notFoundSignal as Error & { digest: string }).digest = "NEXT_NOT_FOUND";
    assertTripAccess.mockRejectedValue(notFoundSignal);

    await expect(
      GET(new Request("http://localhost/api/trips/trip-1/events") as never, makeParams("trip-1"))
    ).rejects.toBe(notFoundSignal);

    expect(requireUser).toHaveBeenCalled();
    expect(subscribeTripForUser).not.toHaveBeenCalled();
  });

  it("gates with viewer access then subscribes to the trip topic keyed by the session user", async () => {
    const response = await GET(new Request("http://localhost/api/trips/trip-1/events") as never, makeParams("trip-1"));

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "viewer");
    expect(subscribeTripForUser).toHaveBeenCalledWith("trip-1", "user-1", expect.any(Function));
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-store, no-transform");
    expect(response.headers.get("Connection")).toBe("keep-alive");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("flushes an immediate heartbeat on connect, before any interval tick", async () => {
    const response = await GET(new Request("http://localhost/api/trips/trip-1/events") as never, makeParams("trip-1"));
    const reader = response.body!.getReader();

    const chunk = await readNextChunk(reader);
    expect(chunk).toBe(formatSseHeartbeat());
    await reader.cancel().catch(() => {});
  });

  it("streams a published event through to the client", async () => {
    const response = await GET(new Request("http://localhost/api/trips/trip-1/events") as never, makeParams("trip-1"));
    const reader = response.body!.getReader();
    const publish = subscribeTripForUser.mock.calls[0][2] as (event: unknown) => void;

    await readNextChunk(reader); // the immediate connect heartbeat

    const event = { type: "itinerary-changed", tripId: "trip-1" } as const;
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
    const response = await GET(new Request("http://localhost/api/trips/trip-1/events") as never, makeParams("trip-1"));
    const reader = response.body!.getReader();
    const deliver = subscribeTripForUser.mock.calls[0][2] as (frame: unknown) => void;

    await readNextChunk(reader); // the immediate connect heartbeat

    deliver({ type: "heartbeat" });

    const chunk = await readNextChunk(reader);
    expect(chunk).toBe(formatSseHeartbeat());
    await reader.cancel().catch(() => {});
  });

  it("removes the subscriber and closes the stream when the request aborts", async () => {
    const unsubscribe = vi.fn();
    subscribeTripForUser.mockReturnValue(unsubscribe);
    const controller = new AbortController();
    const request = new Request("http://localhost/api/trips/trip-1/events", {
      signal: controller.signal,
    }) as never;

    const response = await GET(request, makeParams("trip-1"));
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
    subscribeTripForUser.mockReturnValue(unsubscribe);
    const controller = new AbortController();
    const request = new Request("http://localhost/api/trips/trip-1/events", {
      signal: controller.signal,
    }) as never;
    controller.abort();

    const response = await GET(request, makeParams("trip-1"));

    expect(unsubscribe).toHaveBeenCalledOnce();
    const { done } = await response.body!.getReader().read();
    expect(done).toBe(true);
  });
});
