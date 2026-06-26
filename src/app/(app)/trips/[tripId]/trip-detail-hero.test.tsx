import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import type { TripDetailPayload } from "@/data/types";
import { TripDetailHero } from "./trip-detail-hero";

const mockRemoveTripCover = vi.fn();
const mockSetTripCoverWithAttribution = vi.fn();

vi.mock("@/components/packt/trip-cover", () => ({
  TripCover: () => <div data-testid="trip-cover" />,
}));

vi.mock("@/components/packt/cover-image-picker", () => ({
  CoverImagePicker: ({
    onImageSelected,
  }: {
    onImageSelected: (image: { url: string; photographer?: string; photographerUrl?: string }) => void;
  }) => (
    <div data-testid="cover-image-picker">
      <button
        onClick={() =>
          onImageSelected({
            url: "https://images.example.com/selected-cover.jpg",
            photographer: "Casey Camera",
            photographerUrl: "https://unsplash.com/@caseycamera",
          })
        }
      >
        apply-search-photo
      </button>
    </div>
  ),
}));

vi.mock("@/components/packt/cover-attribution-dialog", () => ({
  CoverAttributionDialog: ({
    open,
    photographer,
    photographerUrl,
  }: {
    open: boolean;
    photographer: string;
    photographerUrl?: string;
  }) =>
    open ? (
      <div data-testid="cover-attribution-dialog">
        <span>{photographer}</span>
        {photographerUrl ? <a href={photographerUrl}>View on Unsplash</a> : null}
      </div>
    ) : null,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({
    children,
    title,
    onClick,
  }: {
    children: React.ReactNode;
    title?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button type="button" title={title} onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  removeTripCover: (...args: unknown[]) => mockRemoveTripCover(...args),
  setTripCoverWithAttribution: (...args: unknown[]) => mockSetTripCoverWithAttribution(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

function buildDetail(overrides: Partial<TripDetailPayload> = {}): TripDetailPayload {
  return {
    trip: {
      id: "trip-1",
      name: "Summer Getaway",
      status: "draft",
      ...overrides.trip,
    },
    days: [{ id: "day-1", dayNumber: 1, label: "Day 1", events: [] }],
    unscheduledEvents: [],
    docs: [],
    collaborators: [],
    packingItems: [],
    packingLists: [],
    reservations: [],
    expenses: [],
    ...overrides,
  };
}

describe("TripDetailHero", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemoveTripCover.mockResolvedValue(undefined);
    mockSetTripCoverWithAttribution.mockResolvedValue(undefined);
  });

  it("shows the correct day count for a dateless trip with one day (AC14)", () => {
    render(
      <TripDetailHero detail={buildDetail()} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />
    );

    expect(screen.getByText("1 day")).toBeInTheDocument();
  });

  it("shows the correct day count for a dateless trip with multiple days", () => {
    const detail = buildDetail({
      days: [
        { id: "day-1", dayNumber: 1, label: "Day 1", events: [] },
        { id: "day-2", dayNumber: 2, label: "Day 2", events: [] },
        { id: "day-3", dayNumber: 3, label: "Day 3", events: [] },
      ],
    });
    render(<TripDetailHero detail={detail} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />);

    expect(screen.getByText("3 days")).toBeInTheDocument();
  });

  it("shows the date-derived count for a scheduled trip", () => {
    const detail = buildDetail({
      trip: {
        id: "trip-1",
        name: "Scheduled Trip",
        status: "upcoming",
        startDate: "2026-08-01",
        endDate: "2026-08-03",
      },
      days: [
        { id: "day-1", dayNumber: 1, date: "2026-08-01", label: "Day 1", events: [] },
        { id: "day-2", dayNumber: 2, date: "2026-08-02", label: "Day 2", events: [] },
        { id: "day-3", dayNumber: 3, date: "2026-08-03", label: "Day 3", events: [] },
      ],
    });
    render(<TripDetailHero detail={detail} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />);

    expect(screen.getByText("3 days")).toBeInTheDocument();
  });

  it("renders cover overflow trigger", () => {
    render(
      <TripDetailHero detail={buildDetail()} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />
    );

    expect(screen.getByTitle("Cover options")).toBeInTheDocument();
  });

  it("shows edit only for graphic covers", () => {
    render(
      <TripDetailHero
        detail={buildDetail({
          trip: { id: "trip-1", name: "Summer Getaway", status: "draft", coverImageUrl: "graphic:foo/bar/baz" },
        })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Edit Cover" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Cover" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Info" })).not.toBeInTheDocument();
  });

  it("shows remove but not info for map covers", () => {
    render(
      <TripDetailHero
        detail={buildDetail({
          trip: {
            id: "trip-1",
            name: "Summer Getaway",
            status: "draft",
            coverImageUrl: "/api/mapbox/static?lng=2.347&lat=48.859",
          },
        })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Remove Cover" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Info" })).not.toBeInTheDocument();
  });

  it("shows remove and info for attributed photo covers", () => {
    render(
      <TripDetailHero
        detail={buildDetail({
          trip: {
            id: "trip-1",
            name: "Summer Getaway",
            status: "draft",
            coverImageUrl: "https://images.example.com/cover.jpg",
            coverPhotographer: "Casey Camera",
            coverPhotographerUrl: "https://unsplash.com/@caseycamera",
          },
        })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Remove Cover" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Info" })).toBeInTheDocument();
  });

  it("opens the cover image picker from Edit Cover", async () => {
    const user = userEvent.setup();

    render(
      <TripDetailHero detail={buildDetail()} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Edit Cover" }));

    expect(screen.getByTestId("cover-image-picker")).toBeInTheDocument();
  });

  it("persists selected cover attribution from the picker", async () => {
    const user = userEvent.setup();

    render(
      <TripDetailHero detail={buildDetail()} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Edit Cover" }));
    await user.click(screen.getByRole("button", { name: "apply-search-photo" }));

    await waitFor(() => {
      expect(mockSetTripCoverWithAttribution).toHaveBeenCalledWith(
        "trip-1",
        "https://images.example.com/selected-cover.jpg",
        "Casey Camera",
        "https://unsplash.com/@caseycamera"
      );
    });
  });

  it("removes current cover through server action", async () => {
    const user = userEvent.setup();

    render(
      <TripDetailHero
        detail={buildDetail({
          trip: {
            id: "trip-1",
            name: "Summer Getaway",
            status: "draft",
            coverImageUrl: "https://images.example.com/cover.jpg",
          },
        })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove Cover" }));

    await waitFor(() => {
      expect(mockRemoveTripCover).toHaveBeenCalledWith("trip-1");
    });
  });

  it("opens attribution dialog with photographer details", async () => {
    const user = userEvent.setup();

    render(
      <TripDetailHero
        detail={buildDetail({
          trip: {
            id: "trip-1",
            name: "Summer Getaway",
            status: "draft",
            coverImageUrl: "https://images.example.com/cover.jpg",
            coverPhotographer: "Casey Camera",
            coverPhotographerUrl: "https://unsplash.com/@caseycamera",
          },
        })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Info" }));

    expect(screen.getByTestId("cover-attribution-dialog")).toBeInTheDocument();
    expect(screen.getByText("Casey Camera")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View on Unsplash" })).toHaveAttribute(
      "href",
      "https://unsplash.com/@caseycamera"
    );
  });

  it("shows remove but not info for photo covers without attribution", () => {
    render(
      <TripDetailHero
        detail={buildDetail({
          trip: {
            id: "trip-1",
            name: "Summer Getaway",
            status: "draft",
            coverImageUrl: "https://images.example.com/uploaded-cover.jpg",
          },
        })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Edit Cover" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Cover" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Info" })).not.toBeInTheDocument();
  });

  it("shows toast on setTripCoverWithAttribution failure", async () => {
    mockSetTripCoverWithAttribution.mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();

    render(
      <TripDetailHero detail={buildDetail()} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Edit Cover" }));
    await user.click(screen.getByRole("button", { name: "apply-search-photo" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not save cover image");
    });
  });

  it("shows toast on removeTripCover failure", async () => {
    mockRemoveTripCover.mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();

    render(
      <TripDetailHero
        detail={buildDetail({
          trip: {
            id: "trip-1",
            name: "Summer Getaway",
            status: "draft",
            coverImageUrl: "https://images.example.com/cover.jpg",
          },
        })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove Cover" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not remove cover image");
    });
  });
});
