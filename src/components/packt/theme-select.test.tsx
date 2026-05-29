import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSetTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: mockSetTheme }),
}));

import { ThemeSelect } from "./theme-select";

describe("ThemeSelect", () => {
  it("renders a combobox trigger labelled Theme", () => {
    render(<ThemeSelect />);
    expect(screen.getByRole("combobox", { name: /theme/i })).toBeInTheDocument();
  });

  it("calls setTheme when an option is selected", async () => {
    const user = userEvent.setup();
    render(<ThemeSelect />);
    await user.click(screen.getByRole("combobox", { name: /theme/i }));
    await user.click(await screen.findByRole("option", { name: /dark/i }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("renders enabled trigger when mounted", () => {
    render(<ThemeSelect />);
    expect(screen.getByRole("combobox", { name: /theme/i })).not.toBeDisabled();
  });
});
