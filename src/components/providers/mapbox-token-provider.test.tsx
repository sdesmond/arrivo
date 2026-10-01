import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { MapboxTokenProvider, useMapboxToken } from "./mapbox-token-provider";

describe("useMapboxToken", () => {
  it("returns the token supplied by the nearest provider", () => {
    const { result } = renderHook(() => useMapboxToken(), {
      wrapper: ({ children }) => <MapboxTokenProvider token="pk.runtime">{children}</MapboxTokenProvider>,
    });

    expect(result.current).toBe("pk.runtime");
  });

  it("returns an empty token outside a provider", () => {
    const { result } = renderHook(() => useMapboxToken());

    expect(result.current).toBe("");
  });
});
