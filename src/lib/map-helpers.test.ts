import { describe, expect, it } from "vitest";
import type { LocatedItemPin, TripEvent } from "@/data/types";
import { declusterPins, getLocatedItemPins, transformMapboxUrl } from "./map-helpers";

function makeEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return {
    id: "event-1",
    name: "Louvre Museum",
    position: 0,
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
});

function makePin(overrides: Partial<LocatedItemPin> = {}): LocatedItemPin {
  return { id: "pin-1", name: "Pin", lat: 48.8606, lng: 2.3376, ...overrides };
}

describe("declusterPins", () => {
  it("leaves pins with unique coordinates unchanged", () => {
    const pins = [makePin({ id: "pin-1", lat: 48.8606, lng: 2.3376 }), makePin({ id: "pin-2", lat: 35.0, lng: 139.0 })];
    expect(declusterPins(pins)).toEqual(pins);
  });

  it("offsets the second and later pins that share exact coordinates", () => {
    const pins = [
      makePin({ id: "pin-1", lat: 48.8606, lng: 2.3376 }),
      makePin({ id: "pin-2", lat: 48.8606, lng: 2.3376 }),
      makePin({ id: "pin-3", lat: 48.8606, lng: 2.3376 }),
    ];

    const result = declusterPins(pins);

    expect(result[0]).toEqual(pins[0]);
    expect(result[1].lat).toBeGreaterThan(pins[1].lat);
    expect(result[1].lng).toBeGreaterThan(pins[1].lng);
    expect(result[2].lat).toBeGreaterThan(result[1].lat);
    expect(result[2].lng).toBeGreaterThan(result[1].lng);
    const uniqueCoordinates = new Set(result.map((pin) => `${pin.lat},${pin.lng}`));
    expect(uniqueCoordinates.size).toBe(3);
  });

  it("only offsets pins that collide, leaving distinct coordinates in a mixed list untouched", () => {
    const pins = [
      makePin({ id: "pin-1", lat: 48.8606, lng: 2.3376 }),
      makePin({ id: "pin-2", lat: 35.0, lng: 139.0 }),
      makePin({ id: "pin-3", lat: 48.8606, lng: 2.3376 }),
    ];

    const result = declusterPins(pins);

    expect(result[0]).toEqual(pins[0]);
    expect(result[1]).toEqual(pins[1]);
    expect(result[2]).not.toEqual(pins[2]);
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
