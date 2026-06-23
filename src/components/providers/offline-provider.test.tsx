import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { OfflineProvider, useOffline } from "./offline-provider";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.spyOn(window.navigator, "onLine", "get").mockRestore();
});

function renderUseOffline() {
  return renderHook(() => useOffline(), { wrapper: OfflineProvider });
}

describe("OfflineProvider", () => {
  it("reports online when navigator.onLine is true", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderUseOffline();
    expect(result.current.online).toBe(true);
    expect(result.current.offline).toBe(false);
  });

  it("reports offline when navigator.onLine is false", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const { result } = renderUseOffline();
    expect(result.current.online).toBe(false);
    expect(result.current.offline).toBe(true);
  });

  it("defaults conflict, pendingCount, and pinFailure", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderUseOffline();
    expect(result.current.conflict).toBe(false);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.pinFailure).toBeNull();
  });

  it("exposes no-op retrySync and openConflictReview callbacks", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderUseOffline();
    expect(() => result.current.retrySync()).not.toThrow();
    expect(() => result.current.openConflictReview()).not.toThrow();
  });

  it("throws when useOffline is called outside a provider", () => {
    expect(() => renderHook(() => useOffline())).toThrow("useOffline must be used within an OfflineProvider");
  });
});
