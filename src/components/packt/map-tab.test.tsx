import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Reservation, TripEvent } from "@/data/types";

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

describe("MapTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mapConstructorSpy.mockClear();
    markerConstructorSpy.mockClear();
    mapInstances.length = 0;
    markerInstances.length = 0;
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
