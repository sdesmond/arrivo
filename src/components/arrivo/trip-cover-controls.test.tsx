import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import * as navigation from "next/navigation";
import type { TripDetailPayload } from "@/data/types";
import { TripCoverControls } from "./trip-cover-controls";
function TripDetailHero({
  detail,
}: {
  detail: TripDetailPayload;
  nowISO: string;
  dateFormat: string;
  onEdit: () => void;
}) {
  return <TripCoverControls trip={detail.trip} canEdit={detail.accessRole !== "viewer"} />;
}

const mockApi = vi.fn();

vi.mock("@/components/arrivo/trip-cover", () => ({
  TripCover: () => <div data-testid="trip-cover" />,
}));

vi.mock("@/components/arrivo/cover-image-picker", () => ({
  CoverImagePicker: ({
    onImageSelected,
    onClose,
  }: {
    onClose: () => void;
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
      <button onClick={() => onImageSelected({ url: "https://example.com/url.jpg" })}>apply-url</button>
      <button onClick={onClose}>close-picker</button>
    </div>
  ),
}));

vi.mock("@/components/arrivo/cover-attribution-dialog", () => ({
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

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: (...args: unknown[]) => mockApi(...args),
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
    notes: [],
    accessRole: "editor",
    ...overrides,
  };
}

describe("TripCoverControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const router = navigation.useRouter();
    vi.spyOn(navigation, "useRouter").mockReturnValue(router);
    mockApi.mockReset();
    mockApi.mockResolvedValue(null);
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
      expect(mockApi).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT" }), {
        params: { tripId: "trip-1" },
        body: {
          coverImageUrl: "https://images.example.com/selected-cover.jpg",
          coverPhotographer: "Casey Camera",
          coverPhotographerUrl: "https://unsplash.com/@caseycamera",
        },
      });
    });
  });

  it("removes current cover through API", async () => {
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
      expect(mockApi).toHaveBeenCalledWith(expect.objectContaining({ method: "DELETE" }), {
        params: { tripId: "trip-1" },
        body: {},
      });
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

  it("shows toast on cover PUT failure", async () => {
    mockApi.mockRejectedValue(new Error("Network error"));
    const user = userEvent.setup();

    render(
      <TripDetailHero detail={buildDetail()} nowISO="2026-07-01T00:00:00Z" dateFormat="MM/DD/YYYY" onEdit={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Edit Cover" }));
    await user.click(screen.getByRole("button", { name: "apply-search-photo" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Could not save changes. Try again.");
    });
  });

  it("hides the cover options trigger for a viewer when there is nothing to view", () => {
    render(
      <TripDetailHero
        detail={buildDetail({ accessRole: "viewer" })}
        nowISO="2026-07-01T00:00:00Z"
        dateFormat="MM/DD/YYYY"
        onEdit={vi.fn()}
      />
    );

    expect(screen.queryByTitle("Cover options")).not.toBeInTheDocument();
  });

  it("hides every cover option for a viewer when attribution exists", () => {
    render(
      <TripDetailHero
        detail={buildDetail({
          accessRole: "viewer",
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

    expect(screen.queryByRole("button", { name: "Edit Cover" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Cover" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Info" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Cover options")).not.toBeInTheDocument();
  });

  it("shows toast on cover DELETE failure", async () => {
    mockApi.mockRejectedValue(new Error("Network error"));
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
      expect(toast.error).toHaveBeenCalledWith("Could not save changes. Try again.");
    });
  });
  it("guards simultaneous PUT and DELETE gestures and releases on settlement", async () => {
    let finish!: (value: null) => void;
    mockApi.mockReturnValueOnce(
      new Promise<null>((resolve) => {
        finish = resolve;
      })
    );
    const user = userEvent.setup();
    render(
      <TripCoverControls
        trip={{ id: "trip-1", name: "Trip", status: "draft", coverImageUrl: "https://example.com/old" }}
        canEdit
      />
    );
    await user.click(screen.getByRole("button", { name: "Edit Cover" }));
    await user.click(screen.getByRole("button", { name: "apply-url" }));
    await user.click(screen.getByRole("button", { name: "apply-url" }));
    await user.click(screen.getByRole("button", { name: "Remove Cover" }));
    expect(mockApi).toHaveBeenCalledTimes(1);
    await act(async () => finish(null));
    await waitFor(() => expect(screen.queryByTestId("cover-image-picker")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Remove Cover" }));
    expect(mockApi).toHaveBeenCalledTimes(2);
    expect(navigation.useRouter().refresh).toHaveBeenCalled();
  });
  it("releases shared guard after auth loss, including a rejected later PUT", async () => {
    mockApi.mockRejectedValueOnce(new ApiClientError(401, "unauthenticated", "Sign in"));
    const user = userEvent.setup();
    render(
      <TripCoverControls
        trip={{ id: "trip-1", name: "Trip", status: "draft", coverImageUrl: "https://example.com/old" }}
        canEdit
      />
    );
    await user.click(screen.getByRole("button", { name: "Edit Cover" }));
    await user.click(screen.getByRole("button", { name: "apply-url" }));
    await waitFor(() => expect(navigation.useRouter().push).toHaveBeenCalledWith("/sign-in"));
    await user.click(screen.getByRole("button", { name: "apply-url" }));
    await user.click(screen.getByRole("button", { name: "Remove Cover" }));
    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2));
  });
  it("closes picker explicitly and clears optional attribution on URL selection", async () => {
    const user = userEvent.setup();
    render(<TripCoverControls trip={{ id: "trip-1", name: "Trip", status: "draft" }} canEdit />);
    await user.click(screen.getByRole("button", { name: "Edit Cover" }));
    await user.click(screen.getByRole("button", { name: "close-picker" }));
    expect(screen.queryByTestId("cover-image-picker")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Cover" }));
    await user.click(screen.getByRole("button", { name: "apply-url" }));
    expect(mockApi).toHaveBeenCalledWith(expect.objectContaining({ method: "PUT" }), {
      params: { tripId: "trip-1" },
      body: { coverImageUrl: "https://example.com/url.jpg", coverPhotographer: null, coverPhotographerUrl: null },
    });
  });
});
