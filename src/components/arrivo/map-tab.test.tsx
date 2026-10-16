import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DayItinerary, Reservation, TripEvent } from "@/data/types";

const { mapConstructorSpy, markerConstructorSpy, mapInstances, markerInstances } = vi.hoisted(() => {
  return {
    mapConstructorSpy: vi.fn(),
    markerConstructorSpy: vi.fn(),
    mapInstances: [] as {
      addControl: ReturnType<typeof vi.fn>;
      jumpTo: ReturnType<typeof vi.fn>;
      fitBounds: ReturnType<typeof vi.fn>;
      easeTo: ReturnType<typeof vi.fn>;
      getZoom: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
    }[],
    markerInstances: [] as { element: HTMLElement; remove: ReturnType<typeof vi.fn> }[],
  };
});

const { mockRouterPush } = vi.hoisted(() => ({ mockRouterPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("maplibre-gl", () => {
  class MockMap {
    addControl = vi.fn();
    jumpTo = vi.fn();
    fitBounds = vi.fn();
    easeTo = vi.fn();
    getZoom = vi.fn(() => 10);
    remove = vi.fn();
    on = vi.fn();
    addSource = vi.fn();
    addLayer = vi.fn();
    constructor(options: unknown) {
      mapConstructorSpy(options);
      mapInstances.push(this);
    }
  }
  class MockMarker {
    element: HTMLElement;
    constructor(options: { element: HTMLElement }) {
      markerConstructorSpy(options);
      this.element = options.element;
      markerInstances.push(this);
    }
    setLngLat = vi.fn(() => this);
    addTo = vi.fn(() => this);
    getElement = vi.fn(() => this.element);
    // Mirrors real MapLibre behavior: once removed, a marker is no longer tracked as active —
    // this lets tests assert "only these pins are currently shown" without stale entries from
    // markers a prior render already tore down.
    remove = vi.fn(() => {
      const index = markerInstances.indexOf(this);
      if (index !== -1) markerInstances.splice(index, 1);
    });
  }
  class MockNavigationControl {}
  class MockLngLatBounds {
    extend = vi.fn(() => this);
    constructor(
      public sw?: unknown,
      public ne?: unknown
    ) {}
  }
  return {
    default: {
      Map: MockMap,
      Marker: MockMarker,
      NavigationControl: MockNavigationControl,
      LngLatBounds: MockLngLatBounds,
    },
  };
});

import { MapboxTokenProvider } from "@/components/providers/mapbox-token-provider";
import { MapTab } from "./map-tab";

function makeEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: "event-1",
    name: "Louvre Museum",
    position: 0,
    ...overrides,
  };
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return { id: "reservation-1", tripId: "trip-1", type: "lodging", provider: "Hotel Lutetia", ...overrides };
}

function makeDay(dayNumber: number, events: TripEvent[], label?: string): DayItinerary {
  return {
    id: `day-${dayNumber}`,
    dayNumber,
    date: `2026-07-0${dayNumber}`,
    label: label ?? `Day ${dayNumber}`,
    events,
  };
}

function markerLabels(): (string | null)[] {
  return markerInstances.map((marker) => marker.element.getAttribute("aria-label"));
}

describe("MapTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mapConstructorSpy.mockClear();
    markerConstructorSpy.mockClear();
    mockRouterPush.mockClear();
    mapInstances.length = 0;
    markerInstances.length = 0;
    window.history.replaceState(null, "", "/");
  });

  it("renders the neutral empty state and no map when there are zero located items", () => {
    render(<MapTab events={[makeEvent({ id: "freeform-1" })]} tripId="trip-1" />);

    expect(screen.getByText("No located stops yet")).toBeInTheDocument();
    expect(screen.queryByTestId("map-tab-container")).not.toBeInTheDocument();
    expect(mapConstructorSpy).not.toHaveBeenCalled();
  });

  it("initializes the map with the access token and container when located items exist", () => {
    render(
      <MapTab events={[makeEvent({ id: "located-1", locationLat: 48.8584, locationLng: 2.2945 })]} tripId="trip-1" />
    );

    expect(screen.getByTestId("map-tab-container")).toBeInTheDocument();
    expect(mapConstructorSpy).toHaveBeenCalledTimes(1);
    expect(mapConstructorSpy.mock.calls[0][0]).toMatchObject({
      center: [2.2945, 48.8584],
    });
  });

  it("wires transformRequest so Mapbox's proprietary mapbox:// source/sprite/glyphs URLs resolve", () => {
    render(
      <MapTab events={[makeEvent({ id: "located-1", locationLat: 48.8584, locationLng: 2.2945 })]} tripId="trip-1" />
    );

    const { transformRequest } = mapConstructorSpy.mock.calls[0][0] as {
      transformRequest: (url: string, resourceType?: string) => { url: string } | undefined;
    };

    expect(transformRequest("mapbox://mapbox.mapbox-streets-v8", "Source")).toMatchObject({
      url: expect.stringContaining("https://api.mapbox.com/v4/mapbox.mapbox-streets-v8.json"),
    });
    expect(transformRequest("https://example.com/tile.pbf", "Tile")).toBeUndefined();
  });

  it("filters out freeform items and only creates markers for located items", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "freeform-1", name: "Shopping" }),
          makeEvent({ id: "located-1", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "located-2", name: "Louvre", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        tripId="trip-1"
      />
    );

    expect(markerConstructorSpy).toHaveBeenCalledTimes(2);
    const labels = markerLabels();
    expect(labels.some((label) => label?.includes("Eiffel Tower"))).toBe(true);
    expect(labels.some((label) => label?.includes("Louvre"))).toBe(true);
    expect(labels.some((label) => label?.includes("Shopping"))).toBe(false);
  });

  it("renders a whole-trip segment and one segment per provided day", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "day-1-event", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "day-2-event", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        days={[
          makeDay(1, [makeEvent({ id: "day-1-event" })], "Paris Day 1"),
          makeDay(2, [makeEvent({ id: "day-2-event" })]),
        ]}
        tripId="trip-1"
      />
    );

    expect(screen.getByRole("tab", { name: "Whole Trip" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Paris Day 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Day 2" })).toBeInTheDocument();
  });

  it("filters located events to the selected day and restores the whole trip", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "day-1-event", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "day-2-event", name: "Louvre", locationLat: 48.8606, locationLng: 2.3376 }),
          makeEvent({ id: "freeform", name: "Shopping" }),
        ]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })]), makeDay(2, [makeEvent({ id: "day-2-event" })])]}
        tripId="trip-1"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Day 1" }));
    expect(markerLabels()).toEqual(["1. Eiffel Tower"]);

    fireEvent.click(screen.getByRole("tab", { name: "Whole Trip" }));
    expect(markerLabels().sort()).toEqual(["1. Eiffel Tower", "2. Louvre"].sort());
  });

  it("builds the map with the runtime token from MapboxTokenProvider", () => {
    render(
      <MapboxTokenProvider token="pk.test">
        <MapTab events={[makeEvent({ locationLat: 48.8584, locationLng: 2.2945 })]} tripId="trip-1" />
      </MapboxTokenProvider>
    );

    expect(mapConstructorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ style: expect.stringContaining("access_token=pk.test") })
    );
  });

  it("does not render a day selector when days are not provided", () => {
    render(<MapTab events={[makeEvent({ locationLat: 48.8584, locationLng: 2.2945 })]} tripId="trip-1" />);

    expect(screen.queryByRole("tablist", { name: "Map scope" })).not.toBeInTheDocument();
  });

  it("updates the URL while preserving the Map tab when selecting a day", () => {
    window.history.replaceState(null, "", "/trips/trip-1?tab=map");
    render(
      <MapTab
        events={[makeEvent({ id: "day-1-event", locationLat: 48.8584, locationLng: 2.2945 })]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })])]}
        tripId="trip-1"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Day 1" }));
    expect(window.location.search).toBe("?tab=map&day=1");

    fireEvent.click(screen.getByRole("tab", { name: "Whole Trip" }));
    expect(window.location.search).toBe("?tab=map");
  });

  it("updates the selected scope after browser navigation changes the day parameter", async () => {
    window.history.replaceState(null, "", "/trips/trip-1?tab=map&day=1");
    render(
      <MapTab
        events={[
          makeEvent({ id: "day-1-event", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "day-2-event", name: "Louvre", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })]), makeDay(2, [makeEvent({ id: "day-2-event" })])]}
        tripId="trip-1"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Day 1" }));
    window.history.pushState(null, "", "/trips/trip-1?tab=map&day=2");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => expect(screen.getByRole("tab", { name: "Day 2" })).toHaveAttribute("aria-selected", "true"));
    expect(markerLabels()).toEqual(["1. Louvre"]);
  });

  it("clears pin detail when its pin disappears after a data refresh", () => {
    const dayOneEvent = makeEvent({
      id: "day-1-event",
      name: "Eiffel Tower",
      locationLat: 48.8584,
      locationLng: 2.2945,
    });
    const { rerender } = render(<MapTab events={[dayOneEvent]} tripId="trip-1" />);

    fireEvent.click(markerInstances[0].element);
    expect(screen.getByTestId("map-tab-pin-detail")).toBeInTheDocument();

    rerender(<MapTab events={[]} tripId="trip-1" />);

    expect(screen.queryByTestId("map-tab-pin-detail")).not.toBeInTheDocument();
  });

  it("updates markers to match the selected day without recreating the map", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "day-1-event", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "day-2-event", name: "Louvre", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })]), makeDay(2, [makeEvent({ id: "day-2-event" })])]}
        tripId="trip-1"
      />
    );

    expect(mapConstructorSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: "Day 2" }));

    expect(mapConstructorSpy).toHaveBeenCalledTimes(1);
    expect(mapInstances[0].remove).not.toHaveBeenCalled();
    expect(markerInstances[markerInstances.length - 1].element).toHaveAttribute("aria-label", "1. Louvre");
  });

  it("seeds the selected day from the dayFilter prop when no URL day param is present", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "day-1-event", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "day-2-event", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })]), makeDay(2, [makeEvent({ id: "day-2-event" })])]}
        dayFilter={2}
        tripId="trip-1"
      />
    );

    expect(screen.getByRole("tab", { name: "Day 2" })).toHaveAttribute("aria-selected", "true");
  });

  it("seeds the selected day from the URL day param on mount", () => {
    window.history.replaceState(null, "", "/trips/trip-1?tab=map&day=2");
    render(
      <MapTab
        events={[
          makeEvent({ id: "day-1-event", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "day-2-event", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })]), makeDay(2, [makeEvent({ id: "day-2-event" })])]}
        tripId="trip-1"
      />
    );

    expect(screen.getByRole("tab", { name: "Day 2" })).toHaveAttribute("aria-selected", "true");
  });

  it("falls back to Whole Trip when dayFilter does not match any day", () => {
    render(
      <MapTab
        events={[makeEvent({ id: "day-1-event", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 })]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })])]}
        dayFilter={99}
        tripId="trip-1"
      />
    );

    expect(screen.getByRole("tab", { name: "Whole Trip" })).toHaveAttribute("aria-selected", "true");
    expect(markerLabels()).toEqual(["1. Eiffel Tower"]);
  });

  it("falls back to a default label when a day's label is an empty string", () => {
    render(
      <MapTab
        events={[makeEvent({ id: "day-1-event", locationLat: 48.8584, locationLng: 2.2945 })]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })], "")]}
        tripId="trip-1"
      />
    );

    expect(screen.getByRole("tab", { name: "Day 1" })).toBeInTheDocument();
  });

  it("keeps reservation pins visible regardless of the selected day", () => {
    render(
      <MapTab
        events={[makeEvent({ id: "day-1-event", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 })]}
        reservations={[
          makeReservation({
            startLocationName: "Gare du Nord",
            startLocationLat: 48.8809,
            startLocationLng: 2.3553,
          }),
        ]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })]), makeDay(2, [])]}
        tripId="trip-1"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Day 2" }));

    const labels = markerLabels();
    expect(labels.some((label) => label?.includes("Gare du Nord"))).toBe(true);
    expect(labels.some((label) => label?.includes("Eiffel Tower"))).toBe(false);
  });

  it("numbers scheduled events continuously across days in Whole Trip view, restarting per day when scoped", () => {
    render(
      <MapTab
        events={[
          makeEvent({
            id: "day-1-event-a",
            name: "Eiffel Tower",
            position: 0,
            locationLat: 48.8584,
            locationLng: 2.2945,
          }),
          makeEvent({ id: "day-1-event-b", name: "Louvre", position: 1, locationLat: 48.8606, locationLng: 2.3376 }),
          makeEvent({
            id: "day-2-event",
            name: "Notre Dame",
            position: 0,
            locationLat: 48.853,
            locationLng: 2.3499,
          }),
        ]}
        days={[
          makeDay(1, [
            makeEvent({ id: "day-1-event-a", position: 0 }),
            makeEvent({ id: "day-1-event-b", position: 1 }),
          ]),
          makeDay(2, [makeEvent({ id: "day-2-event", position: 0 })]),
        ]}
        tripId="trip-1"
      />
    );

    expect(markerLabels()).toEqual(expect.arrayContaining(["1. Eiffel Tower", "2. Louvre", "3. Notre Dame"]));

    fireEvent.click(screen.getByRole("tab", { name: "Day 2" }));
    expect(markerLabels()).toEqual(["1. Notre Dame"]);
  });

  it("does not number a located event that is not scheduled to any day", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "day-1-event", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "unscheduled-event", name: "Someday Museum", locationLat: 48.86, locationLng: 2.35 }),
        ]}
        unscheduledEvents={[makeEvent({ id: "unscheduled-event", name: "Someday Museum" })]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })])]}
        tripId="trip-1"
      />
    );

    expect(markerLabels()).toEqual(expect.arrayContaining(["1. Eiffel Tower", "Someday Museum"]));
  });

  it("numbers every location pin in event order when no days prop is provided at all", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "located-1", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "located-2", name: "Louvre", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        tripId="trip-1"
      />
    );

    expect(markerLabels()).toEqual(["1. Eiffel Tower", "2. Louvre"]);
  });

  it("numbers no pins when days is provided but empty", () => {
    render(
      <MapTab
        events={[makeEvent({ id: "located-1", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 })]}
        days={[]}
        tripId="trip-1"
      />
    );

    expect(markerLabels()).toEqual(["Eiffel Tower"]);
  });

  it("keeps sequence numbers matched to their original pin order after decluttering", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "located-1", name: "First stop", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "located-2", name: "Second stop", locationLat: 48.8584, locationLng: 2.2945 }),
        ]}
        tripId="trip-1"
      />
    );

    expect(markerInstances[0].element).toHaveAttribute("aria-label", "1. First stop");
    expect(markerInstances[1].element).toHaveAttribute("aria-label", "2. Second stop");
  });

  it("renders a reservation stop as a neutral icon badge instead of a number", () => {
    render(
      <MapTab
        events={[]}
        reservations={[
          makeReservation({
            type: "flight",
            startLocationName: "Charles de Gaulle Airport",
            startLocationLat: 49.0097,
            startLocationLng: 2.5479,
          }),
        ]}
        tripId="trip-1"
      />
    );

    const marker = markerInstances[0].element;
    expect(marker).toHaveAttribute("aria-label", "Flight · Charles de Gaulle Airport");
    expect(marker.querySelector("span")).toHaveStyle({ background: "var(--surface-2)" });
    // The marker's `element` is a detached DOM node (MapLibre's mocked `addTo` never appends it
    // to `document`), so `toBeInTheDocument()` can't be used here — check presence directly.
    expect(marker.querySelector(".lucide-plane")).not.toBeNull();
  });

  it("uses a different icon for a different reservation type", () => {
    render(
      <MapTab
        events={[]}
        reservations={[
          makeReservation({
            type: "lodging",
            startLocationName: "Hotel Lutetia",
            startLocationLat: 48.851,
            startLocationLng: 2.3265,
          }),
        ]}
        tripId="trip-1"
      />
    );

    expect(markerInstances[0].element.querySelector(".lucide-hotel")).not.toBeNull();
  });

  it("links day-selector tabs to the results region and announces the visible stop count", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "day-1-event", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "day-2-event", name: "Louvre", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })]), makeDay(2, [makeEvent({ id: "day-2-event" })])]}
        tripId="trip-1"
      />
    );

    const wholeTripTab = screen.getByRole("tab", { name: "Whole Trip" });
    const controlsId = wholeTripTab.getAttribute("aria-controls");
    expect(controlsId).toBeTruthy();
    expect(document.getElementById(controlsId as string)).toBeInTheDocument();
    expect(screen.getByText("2 located stops shown")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Day 1" }));
    expect(screen.getByText("1 located stop shown")).toBeInTheDocument();
  });

  it("supports roving keyboard selection with arrow keys and Home/End", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "day-1-event", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "day-2-event", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        days={[makeDay(1, [makeEvent({ id: "day-1-event" })]), makeDay(2, [makeEvent({ id: "day-2-event" })])]}
        tripId="trip-1"
      />
    );

    const tablist = screen.getByRole("tablist", { name: "Map scope" });
    const wholeTrip = screen.getByRole("tab", { name: "Whole Trip" });
    const dayOne = screen.getByRole("tab", { name: "Day 1" });
    const dayTwo = screen.getByRole("tab", { name: "Day 2" });

    wholeTrip.focus();
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(dayOne).toHaveFocus();
    expect(dayOne).toHaveAttribute("tabindex", "0");
    expect(wholeTrip).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(tablist, { key: "End" });
    expect(dayTwo).toHaveFocus();
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(wholeTrip).toHaveFocus();
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(dayTwo).toHaveFocus();
  });

  it("creates pins for located reservation endpoints", () => {
    render(
      <MapTab
        events={[]}
        reservations={[
          makeReservation({
            startLocationName: "Gare du Nord",
            startLocationLat: 48.8809,
            startLocationLng: 2.3553,
          }),
        ]}
        tripId="trip-1"
      />
    );

    expect(markerConstructorSpy).toHaveBeenCalledTimes(1);
    expect(markerInstances[0].element.getAttribute("aria-label")).toContain("Gare du Nord");
  });

  it("uses jumpTo instead of fitBounds when only a single located item exists", () => {
    render(
      <MapTab events={[makeEvent({ id: "located-1", locationLat: 48.8584, locationLng: 2.2945 })]} tripId="trip-1" />
    );

    expect(mapInstances[0].jumpTo).toHaveBeenCalledTimes(1);
    expect(mapInstances[0].fitBounds).not.toHaveBeenCalled();
  });

  it("fits bounds to all pins with animation when multiple located items exist and motion is not reduced", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "located-1", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "located-2", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        tripId="trip-1"
      />
    );

    expect(mapInstances[0].fitBounds).toHaveBeenCalledTimes(1);
    expect(mapInstances[0].fitBounds.mock.calls[0][1]).toMatchObject({ animate: true });
  });

  it("disables fitBounds animation when prefers-reduced-motion is set", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    render(
      <MapTab
        events={[
          makeEvent({ id: "located-1", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "located-2", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        tripId="trip-1"
      />
    );

    expect(mapInstances[0].fitBounds.mock.calls[0][1]).toMatchObject({ animate: false });
  });

  it("marks the map container as keyboard-focusable with an accessible name", () => {
    render(
      <MapTab events={[makeEvent({ id: "located-1", locationLat: 48.8584, locationLng: 2.2945 })]} tripId="trip-1" />
    );

    const mapContainer = screen.getByRole("application", { name: /trip map/i });
    expect(mapContainer).toHaveAttribute("tabindex", "0");
  });

  it("opens a pin's detail with name, address, and an Open External Maps action when its map pin is clicked", () => {
    render(
      <MapTab
        events={[
          makeEvent({
            id: "located-1",
            name: "Eiffel Tower",
            locationAddress: "Champ de Mars, Paris",
            locationLat: 48.8584,
            locationLng: 2.2945,
          }),
        ]}
        tripId="trip-1"
      />
    );

    fireEvent.click(markerInstances[0].element);

    const detail = screen.getByTestId("map-tab-pin-detail");
    expect(detail).toHaveTextContent("Eiffel Tower");
    expect(detail).toHaveTextContent("Champ de Mars, Paris");
    expect(screen.getByRole("button", { name: "Open External Maps" })).toBeInTheDocument();
  });

  it("opens external maps with the pin's address and coordinates when the action is clicked", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <MapTab
        events={[
          makeEvent({
            id: "located-1",
            name: "Eiffel Tower",
            locationAddress: "Champ de Mars, Paris",
            locationLat: 48.8584,
            locationLng: 2.2945,
          }),
        ]}
        tripId="trip-1"
      />
    );

    fireEvent.click(markerInstances[0].element);
    fireEvent.click(screen.getByRole("button", { name: "Open External Maps" }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent("Champ de Mars, Paris")),
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("closes the pin detail when the close button is clicked", () => {
    render(
      <MapTab
        events={[makeEvent({ id: "located-1", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 })]}
        tripId="trip-1"
      />
    );

    fireEvent.click(markerInstances[0].element);
    expect(screen.getByTestId("map-tab-pin-detail")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close pin detail" }));
    expect(screen.queryByTestId("map-tab-pin-detail")).not.toBeInTheDocument();
  });

  it("navigates to the itinerary tab and focuses the event when View in Itinerary is clicked", () => {
    render(
      <MapTab
        events={[makeEvent({ id: "located-1", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 })]}
        tripId="trip-1"
      />
    );

    fireEvent.click(markerInstances[0].element);
    fireEvent.click(screen.getByRole("button", { name: "View in Itinerary" }));

    expect(mockRouterPush).toHaveBeenCalledWith("?tab=itin&focus=located-1", { scroll: false });
  });

  it("does not show a View in Itinerary action for a reservation stop", () => {
    render(
      <MapTab
        events={[]}
        reservations={[
          makeReservation({
            startLocationName: "Gare du Nord",
            startLocationLat: 48.8809,
            startLocationLng: 2.3553,
          }),
        ]}
        tripId="trip-1"
      />
    );

    fireEvent.click(markerInstances[0].element);

    expect(screen.getByTestId("map-tab-pin-detail")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View in Itinerary" })).not.toBeInTheDocument();
  });

  it("keeps a declustered marker's External Maps coordinates at its stored location", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <MapTab
        events={[
          makeEvent({ id: "located-1", name: "First stop", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "located-2", name: "Second stop", locationLat: 48.8584, locationLng: 2.2945 }),
        ]}
        tripId="trip-1"
      />
    );

    fireEvent.click(markerInstances[1].element);
    fireEvent.click(screen.getByRole("button", { name: "Open External Maps" }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${encodeURIComponent("48.8584")},${encodeURIComponent("2.2945")}`),
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("uses a 44px marker hit target", () => {
    render(
      <MapTab events={[makeEvent({ id: "located-1", locationLat: 48.8584, locationLng: 2.2945 })]} tripId="trip-1" />
    );

    expect(markerInstances[0].element).toHaveStyle({ width: "44px", height: "44px" });
  });

  it("removes markers and the map instance on unmount", () => {
    const { unmount } = render(
      <MapTab events={[makeEvent({ id: "located-1", locationLat: 48.8584, locationLng: 2.2945 })]} tripId="trip-1" />
    );

    const map = mapInstances[0];
    const marker = markerInstances[0];
    unmount();

    expect(marker.remove).toHaveBeenCalledTimes(1);
    expect(map.remove).toHaveBeenCalledTimes(1);
  });

  it("nudges the map camera toward the tapped pin when a marker is selected", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "located-1", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "located-2", name: "Louvre", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        tripId="trip-1"
      />
    );

    fireEvent.click(markerInstances[1].element);

    expect(mapInstances[0].easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [2.3376, 48.8606], zoom: 14 })
    );
  });

  it("skips the camera-nudge animation when prefers-reduced-motion is set", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);

    render(
      <MapTab events={[makeEvent({ id: "located-1", locationLat: 48.8584, locationLng: 2.2945 })]} tripId="trip-1" />
    );

    fireEvent.click(markerInstances[0].element);

    expect(mapInstances[0].easeTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 0 }));
  });

  it("highlights the selected marker and clears the highlight when a different marker is selected", () => {
    render(
      <MapTab
        events={[
          makeEvent({ id: "located-1", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 }),
          makeEvent({ id: "located-2", name: "Louvre", locationLat: 48.8606, locationLng: 2.3376 }),
        ]}
        tripId="trip-1"
      />
    );

    const [firstMarker, secondMarker] = markerInstances;
    const firstVisual = firstMarker.element.querySelector<HTMLElement>("[data-marker-visual]")!;
    const secondVisual = secondMarker.element.querySelector<HTMLElement>("[data-marker-visual]")!;

    fireEvent.click(firstMarker.element);
    expect(firstVisual.style.boxShadow).toBe("0 0 0 3px var(--bg), 0 0 0 6px var(--accent-brand)");

    fireEvent.click(secondMarker.element);
    expect(firstVisual.style.boxShadow).toBe("");
    expect(secondVisual.style.boxShadow).toBe("0 0 0 3px var(--bg), 0 0 0 6px var(--accent-brand)");
  });
});
