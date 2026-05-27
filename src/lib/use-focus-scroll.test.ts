// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockGet = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

import { useFocusScroll } from "./use-focus-scroll";

beforeEach(() => {
  mockGet.mockReset();
});

describe("useFocusScroll", () => {
  it("does not scroll when no focus param", () => {
    mockGet.mockReturnValue(null);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    renderHook(() => useFocusScroll());
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it("calls scrollIntoView when focus param is set and element exists", () => {
    mockGet.mockReturnValue("ev-123");
    const element = document.createElement("div");
    element.id = "event-ev-123";
    const scrollIntoView = vi.fn();
    element.scrollIntoView = scrollIntoView;
    document.body.appendChild(element);

    renderHook(() => useFocusScroll());

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    document.body.removeChild(element);
  });
});
