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

function mockGeolocation(getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
}

interface MockPermissionStatus {
  state: PermissionState;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function mockPermissionStatus(state: PermissionState): MockPermissionStatus {
  return { state, addEventListener: vi.fn(), removeEventListener: vi.fn() };
}

function mockPermissions(status: MockPermissionStatus | (() => Promise<MockPermissionStatus>)) {
  Object.defineProperty(navigator, "permissions", {
    value: { query: vi.fn().mockImplementation(typeof status === "function" ? status : () => Promise.resolve(status)) },
    configurable: true,
  });
}

function removePermissionsApi() {
  Object.defineProperty(navigator, "permissions", { value: undefined, configurable: true });
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
    mockGeolocation(vi.fn());
    mockPermissions(mockPermissionStatus("granted"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("granted permission — route fetching (unchanged behavior)", () => {
    it("returns loading state initially", () => {
      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      expect(result.current.routeResult).toEqual({ status: "loading" });
      expect(result.current.geolocationStatus).toBeNull();
    });

    it("returns ready state after a successful fetch", async () => {
      mockGeolocation((success) => success(fakePosition));
      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

      await flushMicrotasks();

      expect(result.current.routeResult).toEqual({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
      expect(result.current.geolocationStatus).toBeNull();
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

      expect(result.current.routeResult).toEqual({ status: "unavailable" });
    });

    it("returns routeResult null when getCurrentPosition fails despite granted permission", async () => {
      mockGeolocation((_success, error) => {
        error?.({ code: 1, message: "denied" } as GeolocationPositionError);
      });
      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

      await flushMicrotasks();

      expect(result.current.routeResult).toBeNull();
    });

    it("returns routeResult null when the browser has no geolocation API", async () => {
      Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

      await flushMicrotasks();

      expect(result.current.routeResult).toBeNull();
      expect(mockGetRouteDistanceTime).not.toHaveBeenCalled();
    });

    it("returns nulls immediately when the event has no coordinates", () => {
      const { result } = renderHook(() =>
        useRouteForEvent(makeEvent({ locationLat: undefined, locationLng: undefined }), "trip-1", "walk")
      );
      expect(result.current.routeResult).toBeNull();
      expect(result.current.geolocationStatus).toBeNull();
      expect(mockGetRouteDistanceTime).not.toHaveBeenCalled();
    });

    it("does not request geolocation when mounted in a hidden tab", () => {
      const getCurrentPosition = vi.fn();
      mockGeolocation(getCurrentPosition);
      Object.defineProperty(document, "hidden", { value: true, configurable: true });

      renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("resets to loading when the destination changes", async () => {
      let resolveRoute: (result: {
        status: "ready";
        distanceMeters: number;
        durationSeconds: number;
      }) => void = () => {};
      mockGetRouteDistanceTime.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRoute = resolve;
          })
      );
      mockGeolocation((success) => success(fakePosition));
      const { result, rerender } = renderHook(({ event }) => useRouteForEvent(event, "trip-1", "walk"), {
        initialProps: { event: makeEvent() },
      });

      await flushMicrotasks();
      rerender({ event: makeEvent({ locationLat: 48.85, locationLng: 2.35 }) });

      expect(result.current.routeResult).toEqual({ status: "loading" });
      resolveRoute({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
    });

    it("ignores a stale request after a newer refresh resolves", async () => {
      const resolvers: Array<(result: { status: "ready"; distanceMeters: number; durationSeconds: number }) => void> =
        [];
      mockGetRouteDistanceTime.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      );
      mockGeolocation((success) => success(fakePosition));
      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));

      await flushMicrotasks();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      resolvers[1]({ status: "ready", distanceMeters: 800, durationSeconds: 600 });
      await flushMicrotasks();
      resolvers[0]({ status: "ready", distanceMeters: 100, durationSeconds: 60 });
      await flushMicrotasks();

      expect(result.current.routeResult).toEqual({ status: "ready", distanceMeters: 800, durationSeconds: 600 });
    });

    it("uses a bounded geolocation request", async () => {
      const getCurrentPosition = vi.fn();
      mockGeolocation(getCurrentPosition);

      renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      await flushMicrotasks();

      expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { timeout: 3000 });
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

      expect(mockGetRouteDistanceTime).toHaveBeenCalledTimes(3);
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

  describe("geolocation permission detection", () => {
    it("returns geolocationStatus prompt and skips getCurrentPosition when permission is prompt", async () => {
      const getCurrentPosition = vi.fn();
      mockGeolocation(getCurrentPosition);
      mockPermissions(mockPermissionStatus("prompt"));

      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      await flushMicrotasks();

      expect(result.current.routeResult).toBeNull();
      expect(result.current.geolocationStatus).toEqual({ state: "prompt", permissionState: "prompt" });
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("returns geolocationStatus denied and skips getCurrentPosition when permission is denied", async () => {
      const getCurrentPosition = vi.fn();
      mockGeolocation(getCurrentPosition);
      mockPermissions(mockPermissionStatus("denied"));

      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      await flushMicrotasks();

      expect(result.current.routeResult).toBeNull();
      expect(result.current.geolocationStatus).toEqual({ state: "denied" });
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("proceeds with normal route fetch when permission is granted", async () => {
      mockPermissions(mockPermissionStatus("granted"));
      mockGeolocation((success) => success(fakePosition));

      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      await flushMicrotasks();

      expect(result.current.geolocationStatus).toBeNull();
      expect(result.current.routeResult).toEqual({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
    });

    it("defaults to prompt/unknown when the Permissions API is unavailable", async () => {
      const getCurrentPosition = vi.fn();
      mockGeolocation(getCurrentPosition);
      removePermissionsApi();

      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      await flushMicrotasks();

      expect(result.current.geolocationStatus).toEqual({ state: "prompt", permissionState: "unknown" });
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("defaults to prompt/unknown when navigator.permissions.query rejects", async () => {
      mockGeolocation(vi.fn());
      Object.defineProperty(navigator, "permissions", {
        value: { query: vi.fn().mockRejectedValue(new Error("boom")) },
        configurable: true,
      });

      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      await flushMicrotasks();

      expect(result.current.geolocationStatus).toEqual({ state: "prompt", permissionState: "unknown" });
    });

    it("does not render a geo-hint or query permissions when the event has no coordinates", async () => {
      const queryFn = vi.fn().mockResolvedValue(mockPermissionStatus("prompt"));
      Object.defineProperty(navigator, "permissions", { value: { query: queryFn }, configurable: true });

      const { result } = renderHook(() =>
        useRouteForEvent(makeEvent({ locationLat: undefined, locationLng: undefined }), "trip-1", "walk")
      );
      await flushMicrotasks();

      expect(result.current.routeResult).toBeNull();
      expect(result.current.geolocationStatus).toBeNull();
      expect(queryFn).not.toHaveBeenCalled();
    });

    it("begins route fetching after permission transitions from prompt to granted", async () => {
      const status = mockPermissionStatus("prompt");
      mockPermissions(status);
      mockGeolocation((success) => success(fakePosition));

      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      await flushMicrotasks();

      expect(result.current.geolocationStatus).toEqual({ state: "prompt", permissionState: "prompt" });
      expect(status.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

      const changeHandler = status.addEventListener.mock.calls[0][1] as () => void;
      status.state = "granted";
      act(() => changeHandler());
      await flushMicrotasks();

      expect(result.current.geolocationStatus).toBeNull();
      expect(result.current.routeResult).toEqual({ status: "ready", distanceMeters: 500, durationSeconds: 300 });
    });

    it("switches back to geo-hint when permission transitions from granted to prompt", async () => {
      const status = mockPermissionStatus("granted");
      mockPermissions(status);
      mockGeolocation((success) => success(fakePosition));

      const { result } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      await flushMicrotasks();
      expect(result.current.routeResult).toEqual({ status: "ready", distanceMeters: 500, durationSeconds: 300 });

      const changeHandler = status.addEventListener.mock.calls[0][1] as () => void;
      status.state = "prompt";
      act(() => changeHandler());
      await flushMicrotasks();

      expect(result.current.routeResult).toBeNull();
      expect(result.current.geolocationStatus).toEqual({ state: "prompt", permissionState: "prompt" });
    });

    it("removes the permission change listener on unmount", async () => {
      const status = mockPermissionStatus("prompt");
      mockPermissions(status);
      mockGeolocation(vi.fn());

      const { unmount } = renderHook(() => useRouteForEvent(makeEvent(), "trip-1", "walk"));
      await flushMicrotasks();

      unmount();

      expect(status.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });
  });
});
