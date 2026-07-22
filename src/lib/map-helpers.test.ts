import { describe, expect, it } from "vitest";
import type { LocatedItemPin, Reservation, TripEvent } from "@/data/types";
import { getLocatedItemPins, separateNearbyPins, transformMapboxUrl } from "./map-helpers";

function makeEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: "event-1",
    name: "Louvre Museum",
    position: 0,
    ...overrides,
  };
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "reservation-1",
    tripId: "trip-1",
    type: "lodging",
    provider: "Hotel Lutetia",
    ...overrides,
  };
}

describe("getLocatedItemPins", () => {
  it("returns an empty array when there are no located items", () => {
    const events = [makeEvent({ id: "event-1" }), makeEvent({ id: "event-2" })];
    expect(getLocatedItemPins(events)).toEqual([]);
  });

  it("returns only located items when events mix freeform and located items", () => {
    const events = [
      makeEvent({ id: "freeform-1", locationLat: undefined, locationLng: undefined }),
      makeEvent({
        id: "located-1",
        name: "Eiffel Tower",
        locationAddress: "Champ de Mars, Paris",
        locationLat: 48.8584,
        locationLng: 2.2945,
      }),
    ];

    expect(getLocatedItemPins(events)).toEqual([
      {
        id: "located-1",
        name: "Eiffel Tower",
        address: "Champ de Mars, Paris",
        lat: 48.8584,
        lng: 2.2945,
      },
    ]);
  });

  it("excludes events with only one coordinate present", () => {
    const events = [
      makeEvent({ id: "lat-only", locationLat: 48.8584, locationLng: undefined }),
      makeEvent({ id: "lng-only", locationLat: undefined, locationLng: 2.2945 }),
    ];

    expect(getLocatedItemPins(events)).toEqual([]);
  });

  it("returns a pin for each event when multiple events share the same coordinates", () => {
    const events = [
      makeEvent({ id: "located-1", name: "Hotel Check-in", locationLat: 48.8606, locationLng: 2.3376 }),
      makeEvent({ id: "located-2", name: "Hotel Check-out", locationLat: 48.8606, locationLng: 2.3376 }),
    ];

    expect(getLocatedItemPins(events)).toEqual([
      { id: "located-1", name: "Hotel Check-in", address: undefined, lat: 48.8606, lng: 2.3376 },
      { id: "located-2", name: "Hotel Check-out", address: undefined, lat: 48.8606, lng: 2.3376 },
    ]);
  });

  it("returns pins for each located reservation endpoint alongside located events", () => {
    const pins = getLocatedItemPins(
      [makeEvent({ id: "event-1", locationLat: 48.8584, locationLng: 2.2945 })],
      [
        makeReservation({
          id: "reservation-1",
          startLocationName: "Gare du Nord",
          startAddress: "18 Rue de Dunkerque, Paris",
          startLocationLat: 48.8809,
          startLocationLng: 2.3553,
          endLocationName: "Gare de Lyon",
          endAddress: "Place Louis-Armand, Paris",
          endLocationLat: 48.8443,
          endLocationLng: 2.3738,
        }),
      ]
    );

    expect(pins).toEqual([
      expect.objectContaining({ id: "event-1", lat: 48.8584, lng: 2.2945 }),
      {
        id: "reservation-1-start",
        name: "Gare du Nord",
        address: "18 Rue de Dunkerque, Paris",
        lat: 48.8809,
        lng: 2.3553,
        reservationType: "lodging",
      },
      {
        id: "reservation-1-end",
        name: "Gare de Lyon",
        address: "Place Louis-Armand, Paris",
        lat: 48.8443,
        lng: 2.3738,
        reservationType: "lodging",
      },
    ]);
  });
});

function makePin(overrides: Partial<LocatedItemPin> = {}): LocatedItemPin {
  return { id: "pin-1", name: "Pin", lat: 48.8606, lng: 2.3376, ...overrides };
}

describe("separateNearbyPins", () => {
  it("leaves pins with unique coordinates at their source coordinates without marker offsets", () => {
    const pins = [makePin({ id: "pin-1", lat: 48.8606, lng: 2.3376 }), makePin({ id: "pin-2", lat: 35.0, lng: 139.0 })];
    expect(separateNearbyPins(pins)).toEqual(pins.map((pin) => ({ pin, offset: [0, 0] })));
  });

  it("separates exact-coordinate pins using screen-space offsets while preserving their source coordinates", () => {
    const pins = [
      makePin({ id: "pin-1", lat: 48.8606, lng: 2.3376 }),
      makePin({ id: "pin-2", lat: 48.8606, lng: 2.3376 }),
      makePin({ id: "pin-3", lat: 48.8606, lng: 2.3376 }),
    ];

    const result = separateNearbyPins(pins);

    expect(result.map(({ pin }) => pin)).toEqual(pins);
    expect(result.map(({ offset }) => offset)).not.toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
    expect(new Set(result.map(({ offset }) => offset.join(","))).size).toBe(3);
  });

  it("separates pins that are close enough to overlap at map zoom", () => {
    const pins = [
      makePin({ id: "pin-1", lat: 48.8606, lng: 2.3376 }),
      makePin({ id: "pin-2", lat: 48.8607, lng: 2.3377 }),
      makePin({ id: "pin-3", lat: 35.0, lng: 139.0 }),
    ];

    const result = separateNearbyPins(pins);

    expect(result[0].offset).not.toEqual([0, 0]);
    expect(result[1].offset).not.toEqual([0, 0]);
    expect(result[2]).toEqual({ pin: pins[2], offset: [0, 0] });
  });
});

describe("transformMapboxUrl", () => {
  const accessToken = "test-token";

  it("leaves non-mapbox:// URLs untouched", () => {
    expect(transformMapboxUrl("https://example.com/tile.pbf", "Tile", accessToken)).toBeUndefined();
  });

  it("resolves a Source tileset reference to the v4 TileJSON endpoint", () => {
    expect(transformMapboxUrl("mapbox://mapbox.mapbox-streets-v8", "Source", accessToken)).toEqual({
      url: "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8.json?secure&access_token=test-token",
    });
  });

  it("preserves comma-joined composite tileset ids for a Source reference", () => {
    expect(
      transformMapboxUrl("mapbox://mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2", "Source", accessToken)
    ).toEqual({
      url: "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8,mapbox.mapbox-terrain-v2.json?secure&access_token=test-token",
    });
  });

  it("resolves a SpriteJSON reference, inserting the sprite path segment and keeping the scale suffix", () => {
    expect(transformMapboxUrl("mapbox://sprites/mapbox/streets-v11@2x.json", "SpriteJSON", accessToken)).toEqual({
      url: "https://api.mapbox.com/styles/v1/mapbox/streets-v11/sprite@2x.json?access_token=test-token",
    });
  });

  it("resolves a SpriteImage reference without a scale suffix", () => {
    expect(transformMapboxUrl("mapbox://sprites/mapbox/streets-v11.png", "SpriteImage", accessToken)).toEqual({
      url: "https://api.mapbox.com/styles/v1/mapbox/streets-v11/sprite.png?access_token=test-token",
    });
  });

  it("returns undefined for a sprite reference that doesn't match the expected shape", () => {
    expect(transformMapboxUrl("mapbox://sprites/mapbox/streets-v11", "SpriteJSON", accessToken)).toBeUndefined();
  });

  it("resolves a Glyphs reference to the fonts v1 endpoint", () => {
    expect(transformMapboxUrl("mapbox://fonts/mapbox/DIN Pro/0-255.pbf", "Glyphs", accessToken)).toEqual({
      url: "https://api.mapbox.com/fonts/v1/mapbox/DIN Pro/0-255.pbf?access_token=test-token",
    });
  });

  it("leaves mapbox:// URLs untouched for resource types it doesn't handle", () => {
    expect(transformMapboxUrl("mapbox://styles/mapbox/streets-v11", "Style", accessToken)).toBeUndefined();
  });
});
