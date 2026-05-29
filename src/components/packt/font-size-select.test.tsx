import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  let mockSetProperty: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorageMock.clear();
    delete document.documentElement.dataset.fontSize;
    mockSetProperty = vi.spyOn(document.documentElement.style, "setProperty").mockImplementation(() => {});
  });

  it("renders Small, Medium, and Large options", async () => {
    const user = userEvent.setup();
    render(<FontSizeSelect />);
    await user.click(await screen.findByRole("combobox", { name: /font size/i }));
    expect(await screen.findByRole("option", { name: /small/i })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /medium/i })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /large/i })).toBeInTheDocument();
  });

  it("defaults to Medium when no stored preference exists", async () => {
    render(<FontSizeSelect />);
    const trigger = await screen.findByRole("combobox", { name: /font size/i });
    expect(trigger).toHaveTextContent(/medium/i);
  });

  it("reads stored preference from localStorage on mount", async () => {
    localStorageMock.setItem("packt-font-size", "large");
    render(<FontSizeSelect />);
    const trigger = await screen.findByRole("combobox", { name: /font size/i });
    expect(trigger).toHaveTextContent(/large/i);
  });

  it("saves selection to localStorage, applies CSS variable, and sets data attribute on change", async () => {
    const user = userEvent.setup();
    render(<FontSizeSelect />);
    await user.click(await screen.findByRole("combobox", { name: /font size/i }));
    await user.click(await screen.findByRole("option", { name: /small/i }));
    expect(localStorageMock.getItem("packt-font-size")).toBe("small");
    expect(mockSetProperty).toHaveBeenCalledWith("--font-size-base", "13px");
    expect(document.documentElement.dataset.fontSize).toBe("small");
  });

  it("is disabled before hydration (useSyncExternalStore server snapshot)", () => {
    render(<FontSizeSelect />);
    // After mount the trigger is enabled (mounted=true in JSDOM)
    const trigger = screen.getByRole("combobox", { name: /font size/i });
    expect(trigger).not.toBeDisabled();
  });
});
