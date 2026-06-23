import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectivityIndicator } from "./connectivity-indicator";
import { OfflineProvider } from "@/components/providers/offline-provider";

vi.mock("sonner", () => ({
  toast: { info: vi.fn() },
}));

afterEach(() => {
  vi.spyOn(window.navigator, "onLine", "get").mockRestore();
});

function renderIndicator() {
  return render(<ConnectivityIndicator />, { wrapper: OfflineProvider });
}

describe("ConnectivityIndicator", () => {
  it("renders nothing when online", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    renderIndicator();
    expect(screen.queryByLabelText("Offline")).not.toBeInTheDocument();
  });

  it("renders the WifiOff icon button when offline", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderIndicator();
    expect(screen.getByLabelText("Offline")).toBeInTheDocument();
  });

  it("has a persistent aria-label and a hover title", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderIndicator();
    const button = screen.getByLabelText("Offline");
    expect(button).toHaveAttribute("title", "Offline");
  });

  it("shows a toast when clicked", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const user = userEvent.setup();
    renderIndicator();

    const { toast } = await import("sonner");
    await user.click(screen.getByLabelText("Offline"));
    expect(toast.info).toHaveBeenCalledWith(
      "You're offline. Any changes you make will be synced when you're back online.",
      { position: "top-center" }
    );
  });
});
