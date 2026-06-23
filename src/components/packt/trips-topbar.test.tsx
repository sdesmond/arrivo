import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

import { Topbar } from "./trips-topbar";
import { OfflineProvider } from "@/components/providers/offline-provider";

afterEach(() => {
  vi.spyOn(window.navigator, "onLine", "get").mockRestore();
});

function renderTopbar() {
  return render(<Topbar onNewTrip={vi.fn()} />, { wrapper: OfflineProvider });
}

describe("Topbar", () => {
  const defaultProps = {
    onNewTrip: vi.fn(),
  };

  it("renders 'Trips' heading", () => {
    render(<Topbar {...defaultProps} />, { wrapper: OfflineProvider });
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("calls onNewTrip from the New trip button", async () => {
    const user = userEvent.setup();
    const onNewTrip = vi.fn();
    render(<Topbar {...defaultProps} onNewTrip={onNewTrip} />, { wrapper: OfflineProvider });
    await user.click(screen.getByRole("button", { name: /new trip/i }));
    expect(onNewTrip).toHaveBeenCalledOnce();
  });

  it("does not render a Notifications/Bell button", () => {
    render(<Topbar {...defaultProps} />, { wrapper: OfflineProvider });
    expect(screen.queryByTitle("Notifications")).not.toBeInTheDocument();
  });

  it("hides the connectivity indicator when online", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    renderTopbar();
    expect(screen.queryByLabelText("Offline")).not.toBeInTheDocument();
  });

  it("shows the WifiOff connectivity indicator when offline", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderTopbar();
    const indicator = screen.getByLabelText("Offline");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute("title", "Offline");
  });

  it("shows a dismissible offline message when the indicator is clicked", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByLabelText("Offline"));
    expect(
      screen.getByText("You're offline. Any changes you make will be synced when you're back online.")
    ).toBeInTheDocument();
  });
});
