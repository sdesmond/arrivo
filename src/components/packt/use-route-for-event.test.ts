import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { TripEvent } from "@/data/types";

const { mockGetRouteDistanceTime } = vi.hoisted(() => ({
  mockGetRouteDistanceTime: vi.fn(),
}));

vi.mock("@/app/(app)/trips/[tripId]/route-actions", () => ({
  getRouteDistanceTime: mockGetRouteDistanceTime,
}));

import { useRouteForEvent } from "./use-route-for-event";

function makeEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: "event-1",
    name: "Louvre Museum",
    position: 0,
    locationLat: 48.8606,
    locationLng: 2.3376,
    ...overrides,
  };
}

function mockGeolocation(getCurrentPosition: (success: PositionCallback) => void) {
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function flushMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

const fakePosition = { coords: { latitude: 40, longitude: -70 } } as GeolocationPosition;

describe("useRouteForEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockGetRouteDistanceTime.mockReset();
    mockGetRouteDistanceTime.mockResolvedValue({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
    setDocumentHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns loading state initially", () => {
    mockGeolocation(vi.fn());
    const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
    expect(result.current).toEqual({ status: "loading" });
  });

  it("returns ready state after a successful fetch", async () => {
    mockGeolocation((success) => success(fakePosition));
    const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

    await flushMicrotasks();

    expect(result.current).toEqual({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
    expect(mockGetRouteDistanceTime).toHaveBeenCalledWith(
      "trip-1",
      { lat: 40, lng: -70 },
      { lat: 48.8606, lng: 2.3376 },
      "walk"
    );
  });

  it("returns unavailable when the fetch rejects", async () => {
    mockGetRouteDistanceTime.mockRejectedValue(new Error("boom"));
    mockGeolocation((success) => success(fakePosition));
    const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

    await flushMicrotasks();

    expect(result.current).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when geolocation permission is denied", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
          error?.({ code: 1, message: "denied" } as GeolocationPositionError);
        },
      },
      configurable: true,
    });
    const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

    await flushMicrotasks();

    expect(result.current).toEqual({ status: "unavailable" });
  });

  it("returns unavailable when the browser has no geolocation API", async () => {
    Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
    const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

    await flushMicrotasks();

    expect(result.current).toEqual({ status: "unavailable" });
    expect(mockGetRouteDistanceTime).not.toHaveBeenCalled();
  });

  it("returns unavailable immediately when the event has no coordinates", () => {
    mockGeolocation(vi.fn());
    const { result } = renderHook(() =>
      useRouteForEvent(makeEvent({ locationLat: undefined, locationLng: undefined }), "trip-1", "walk")
    );
    expect(result.current).toEqual({ status: "unavailable" });
    expect(mockGetRouteDistanceTime).not.toHaveBeenCalled();
  });

  it("refreshes after 60 seconds", async () => {
    mockGeolocation((success) => success(fakePosition));
    renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

    await flushMicrotasks();
    expect(mockGetRouteDistanceTime).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mockGetRouteDistanceTime).toHaveBeenCalledTimes(2);
  });

  it("pauses refresh when document is hidden", async () => {
    mockGeolocation((success) => success(fakePosition));
    renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

    await flushMicrotasks();
    expect(mockGetRouteDistanceTime).toHaveBeenCalledTimes(1);

    act(() => setDocumentHidden(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(mockGetRouteDistanceTime).toHaveBeenCalledTimes(1);
  });

  it("resumes refresh when the tab becomes visible again", async () => {
    mockGeolocation((success) => success(fakePosition));
    renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

    await flushMicrotasks();
    expect(mockGetRouteDistanceTime).toHaveBeenCalledTimes(1);

    act(() => setDocumentHidden(true));
    act(() => setDocumentHidden(false));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mockGetRouteDistanceTime).toHaveBeenCalledTimes(2);
  });

  it("cleans up the interval and listener on unmount", async () => {
    const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    mockGeolocation((success) => success(fakePosition));
    const { unmount } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

    await flushMicrotasks();
    expect(mockGetRouteDistanceTime).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(mockGetRouteDistanceTime).toHaveBeenCalledTimes(1);
    expect(removeEventListenerSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
