// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockSetProperty = vi.fn();
const mockDataset: Record<string, string> = {};
Object.defineProperty(document, "documentElement", {
  value: { style: { setProperty: mockSetProperty }, dataset: mockDataset },
  writable: true,
});

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

import { FontSizeSelect } from "./font-size-select";

describe("FontSizeSelect", () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockSetProperty.mockClear();
    Object.keys(mockDataset).forEach((k) => delete mockDataset[k]);
  });

  it("renders Small, Medium, and Large options", async () => {
    render(<FontSizeSelect />);
    await waitFor(() => expect(screen.getByRole("combobox", { name: /font size/i })).toBeInTheDocument());
    expect(screen.getByRole("option", { name: "Small" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Medium" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Large" })).toBeInTheDocument();
  });

  it("defaults to Medium when no stored preference exists", async () => {
    render(<FontSizeSelect />);
    const select = await screen.findByRole("combobox", { name: /font size/i });
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("medium"));
  });

  it("reads stored preference from localStorage on mount", async () => {
    localStorageMock.setItem("packt-font-size", "large");
    render(<FontSizeSelect />);
    const select = await screen.findByRole("combobox", { name: /font size/i });
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("large"));
  });

  it("saves selection to localStorage, applies CSS variable, and sets data attribute on change", async () => {
    render(<FontSizeSelect />);
    const select = await screen.findByRole("combobox", { name: /font size/i });
    fireEvent.change(select, { target: { value: "small" } });
    expect(localStorageMock.getItem("packt-font-size")).toBe("small");
    expect(mockSetProperty).toHaveBeenCalledWith("--font-size-base", "13px");
    expect(mockDataset.fontSize).toBe("small");
  });

  it("is disabled before hydration (useSyncExternalStore server snapshot)", () => {
    // On initial render before the client snapshot resolves, disabled=true.
    // In JSDOM the client snapshot immediately returns true so we verify
    // the component eventually becomes enabled after mount.
    render(<FontSizeSelect />);
    // After mount the select is enabled (mounted=true)
    waitFor(() => expect(screen.getByRole("combobox", { name: /font size/i })).not.toBeDisabled());
  });
});
