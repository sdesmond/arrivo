import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

import { Topbar } from "./trips-topbar";

describe("Topbar", () => {
  const defaultProps = {
    onNewTrip: vi.fn(),
  };

  it("renders 'Trips' heading", () => {
    render(<Topbar {...defaultProps} />);
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("calls onNewTrip from the New trip button", async () => {
    const user = userEvent.setup();
    const onNewTrip = vi.fn();
    render(<Topbar {...defaultProps} onNewTrip={onNewTrip} />);
    await user.click(screen.getByRole("button", { name: /new trip/i }));
    expect(onNewTrip).toHaveBeenCalledOnce();
  });
});
