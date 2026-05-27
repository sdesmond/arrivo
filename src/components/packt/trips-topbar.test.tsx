// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

import { Topbar } from "./trips-topbar";

describe("Topbar", () => {
  const defaultProps = {
    tripCount: 3,
    pastCount: 2,
    now: new Date("2026-05-13"),
    onNewTrip: vi.fn(),
  };

  it("renders 'My trips' heading", () => {
    render(<Topbar {...defaultProps} />);
    expect(screen.getByText("My trips")).toBeInTheDocument();
  });

  it("renders trip count info", () => {
    render(<Topbar {...defaultProps} />);
    expect(screen.getByText(/· trips ·/)).toBeInTheDocument();
  });

  it("renders singular 'trip' when count is 1", () => {
    render(<Topbar {...defaultProps} tripCount={1} pastCount={0} />);
    expect(screen.getByText(/· trip ·/)).toBeInTheDocument();
  });

  it("renders past count info", () => {
    render(<Topbar {...defaultProps} />);
    expect(screen.getByText(/2 past/i)).toBeInTheDocument();
  });

  it("calls onNewTrip from the New trip button", async () => {
    const user = userEvent.setup();
    const onNewTrip = vi.fn();
    render(<Topbar {...defaultProps} onNewTrip={onNewTrip} />);
    await user.click(screen.getByRole("button", { name: /new trip/i }));
    expect(onNewTrip).toHaveBeenCalledOnce();
  });
});
