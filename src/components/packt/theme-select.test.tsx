// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: mockSetTheme }),
}));

import { ThemeSelect } from "./theme-select";

describe("ThemeSelect", () => {
  it("renders all three theme options", () => {
    render(<ThemeSelect />);
    expect(screen.getByRole("combobox", { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "System" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dark" })).toBeInTheDocument();
  });

  it("calls setTheme when selection changes", () => {
    render(<ThemeSelect />);
    fireEvent.change(screen.getByRole("combobox", { name: /theme/i }), {
      target: { value: "dark" },
    });
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
