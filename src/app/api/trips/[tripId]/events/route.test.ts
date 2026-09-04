// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, requireUser, subscribeTripForUser, formatSseEvent, formatSseHeartbeat } = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  requireUser: vi.fn(),
  subscribeTripForUser: vi.fn(),
  formatSseEvent: vi.fn((event: unknown) => `data: ${JSON.stringify(event)}\n\n`),
  formatSseHeartbeat: vi.fn(() => 'data: {"type":"heartbeat"}\n\n'),
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

vi.mock("@/lib/trip-events", () => ({
  SSE_HEARTBEAT_INTERVAL_MS: 15_000,
  formatSseEvent,
  formatSseHeartbeat,
  subscribeTripForUser,
}));

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

  it("streams a published event through to the client", async () => {
    const response = await GET(new Request("http://localhost/api/trips/trip-1/events") as never, makeParams("trip-1"));
    const reader = response.body!.getReader();
    const publish = subscribeTripForUser.mock.calls[0][2] as (event: unknown) => void;

    const event = { type: "itinerary-changed", tripId: "trip-1" };
    publish(event);

    const chunk = await readNextChunk(reader);
    expect(chunk).toBe(formatSseEvent(event));
    await reader.cancel().catch(() => {});
  });

  it("emits a heartbeat data event on an idle connection", async () => {
    vi.useFakeTimers();
    const response = await GET(new Request("http://localhost/api/trips/trip-1/events") as never, makeParams("trip-1"));
    const reader = response.body!.getReader();

    vi.advanceTimersByTime(15_000);

    const chunk = await readNextChunk(reader);
    expect(chunk).toBe(formatSseHeartbeat());
    await reader.cancel().catch(() => {});
  });

  it("removes the subscriber and clears the heartbeat interval when the request aborts", async () => {
    const unsubscribe = vi.fn();
    subscribeTripForUser.mockReturnValue(unsubscribe);
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const controller = new AbortController();
    const request = new Request("http://localhost/api/trips/trip-1/events", {
      signal: controller.signal,
    }) as never;

    const response = await GET(request, makeParams("trip-1"));
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
    subscribeTripForUser.mockReturnValue(unsubscribe);
    const controller = new AbortController();
    const request = new Request("http://localhost/api/trips/trip-1/events", {
      signal: controller.signal,
    }) as never;
    controller.abort();

    await GET(request, makeParams("trip-1"));

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
