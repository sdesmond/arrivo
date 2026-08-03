import { afterEach, describe, expect, it, vi } from "vitest";
import { openExternalMaps } from "./open-external-maps";

describe("openExternalMaps", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens a Google Maps directions URL with the encoded address when an address is provided", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openExternalMaps({ address: "99 Rue de Rivoli, 75001 Paris, France" });
    expect(openSpy).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=99%20Rue%20de%20Rivoli%2C%2075001%20Paris%2C%20France",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("opens a Google Maps directions URL with lat,lng when no address is provided", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openExternalMaps({ lat: 48.8606, lng: 2.3376 });
    expect(openSpy).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=48.8606,2.3376",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("prefers the address over coordinates when both are provided", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openExternalMaps({ address: "Louvre Museum", lat: 48.8606, lng: 2.3376 });
    expect(openSpy).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=Louvre%20Museum",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("does nothing when neither an address nor coordinates are provided", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openExternalMaps({ label: "Somewhere" });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("does nothing when only one coordinate is present", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openExternalMaps({ lat: 48.8606 });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("treats an empty address as absent and falls back to coordinates", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openExternalMaps({ address: "", lat: 48.8606, lng: 2.3376 });
    expect(openSpy).toHaveBeenCalledWith(
      "https://www.google.com/maps/dir/?api=1&destination=48.8606,2.3376",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("does nothing in an SSR environment where window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(() => openExternalMaps({ address: "Louvre Museum" })).not.toThrow();
  });
});
