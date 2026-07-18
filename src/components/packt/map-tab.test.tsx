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
      remove: ReturnType<typeof vi.fn>;
    }[],
    markerInstances: [] as { element: HTMLElement; remove: ReturnType<typeof vi.fn> }[],
  };
});

vi.mock("maplibre-gl", () => {
  class MockMap {
    addControl = vi.fn();
    jumpTo = vi.fn();
    fitBounds = vi.fn();
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
    remove = vi.fn();
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

describe("MapTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mapConstructorSpy.mockClear();
    markerConstructorSpy.mockClear();
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
    expect(screen.getByRole("button", { name: /Eiffel Tower/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Louvre/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Shopping/ })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Eiffel Tower" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Louvre" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shopping" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Whole Trip" }));
    expect(screen.getByRole("button", { name: "Eiffel Tower" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Louvre" })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Louvre" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eiffel Tower" })).not.toBeInTheDocument();
  });

  it("clears pin detail when its pin disappears after a data refresh", () => {
    const dayOneEvent = makeEvent({
      id: "day-1-event",
      name: "Eiffel Tower",
      locationLat: 48.8584,
      locationLng: 2.2945,
    });
    const { rerender } = render(<MapTab events={[dayOneEvent]} tripId="trip-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Eiffel Tower" }));
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
    expect(markerInstances[markerInstances.length - 1].element).toHaveAttribute("aria-label", "Louvre");
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
    expect(screen.getByRole("button", { name: "Eiffel Tower" })).toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: /Gare du Nord/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eiffel Tower" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /Gare du Nord/ })).toBeInTheDocument();
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

  it("opens a pin's detail with name, address, and an Open External Maps action when its list button is clicked", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /Eiffel Tower/ }));

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

    fireEvent.click(screen.getByRole("button", { name: /Eiffel Tower/ }));
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

    fireEvent.click(screen.getByRole("button", { name: /Eiffel Tower/ }));
    expect(screen.getByTestId("map-tab-pin-detail")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close pin detail" }));
    expect(screen.queryByTestId("map-tab-pin-detail")).not.toBeInTheDocument();
  });

  it("opens a pin's detail when its map marker is clicked directly", () => {
    render(
      <MapTab
        events={[makeEvent({ id: "located-1", name: "Eiffel Tower", locationLat: 48.8584, locationLng: 2.2945 })]}
        tripId="trip-1"
      />
    );

    fireEvent.click(markerInstances[0].element);

    expect(screen.getByTestId("map-tab-pin-detail")).toHaveTextContent("Eiffel Tower");
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
});
