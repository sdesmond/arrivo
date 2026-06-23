import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { TripDetailCrumb } from "./trip-detail-crumb";
import { OfflineProvider } from "@/components/providers/offline-provider";

afterEach(() => {
  vi.spyOn(window.navigator, "onLine", "get").mockRestore();
});

function renderCrumb(onEdit = vi.fn()) {
  return render(<TripDetailCrumb tripName="Paris Trip" onEdit={onEdit} />, { wrapper: OfflineProvider });
}

describe("TripDetailCrumb", () => {
  it("renders the trip name", () => {
    renderCrumb();
    expect(screen.getByText("Paris Trip")).toBeInTheDocument();
  });

  it("renders a back link to /trips", () => {
    renderCrumb();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/trips");
  });

  it("calls onEdit from the Edit button", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderCrumb(onEdit);
    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("does not render a Download/Offline button", () => {
    renderCrumb();
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
  });

  it("hides the connectivity indicator when online", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    renderCrumb();
    expect(screen.queryByLabelText("Offline")).not.toBeInTheDocument();
  });

  it("shows the WifiOff connectivity indicator with aria-label when offline", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    renderCrumb();
    expect(screen.getByLabelText("Offline")).toBeInTheDocument();
  });
});
