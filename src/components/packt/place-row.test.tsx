import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createExpense, deleteExpense, updateExpense } = vi.hoisted(() => ({
  createExpense: vi.fn(),
  deleteExpense: vi.fn(),
  updateExpense: vi.fn(),
}));

vi.mock("@/app/(app)/trips/[tripId]/budget/actions", () => ({
  createExpense,
  deleteExpense,
  updateExpense,
}));

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn(), warning: vi.fn() },
}));

const { openExternalMaps } = vi.hoisted(() => ({ openExternalMaps: vi.fn() }));

vi.mock("@/lib/open-external-maps", () => ({ openExternalMaps }));

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    MapPin: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="map-pin-icon" data-stroke-width={strokeWidth} {...props} />
    ),
    Hotel: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="hotel-icon" data-stroke-width={strokeWidth} {...props} />
    ),
  };
});

vi.mock("./docs-block", () => ({
  DocsBlock: ({ docs, onAdd }: { docs: { id: string; name: string }[]; onAdd?: () => void }) => (
    <div data-testid="docs-block">
      {docs.map((doc) => (
        <span key={doc.id}>{doc.name}</span>
      ))}
      {onAdd ? <button onClick={onAdd}>add-doc-in-block</button> : null}
    </div>
  ),
}));
vi.mock("./place-row-dialogs", () => ({
  PlaceRowDialogs: ({
    showTimeDialog,
    onTimeOpenChange,
    onTimeSave,
    showCostDialog,
    onCostOpenChange,
    onCostSave,
    onCostRemove,
    showLocationDialog,
    onLocationOpenChange,
    onLocationSave,
    showAddDocDialog,
    onAddDocOpenChange,
    showDeleteDialog,
    onDeleteOpenChange,
  }: {
    showTimeDialog: boolean;
    onTimeOpenChange: (v: boolean) => void;
    onTimeSave: (t?: string, et?: string) => void;
    showCostDialog: boolean;
    onCostOpenChange: (v: boolean) => void;
    onCostSave: (expense: { category: string; amount: number; currency: string; date: string }) => void;
    onCostRemove?: () => void;
    showLocationDialog: boolean;
    onLocationOpenChange: (v: boolean) => void;
    onLocationSave: (location?: { address: string; name?: string; lat?: number; lng?: number }) => void;
    showAddDocDialog: boolean;
    onAddDocOpenChange: (v: boolean) => void;
    showDeleteDialog: boolean;
    onDeleteOpenChange: (v: boolean) => void;
  }) => (
    <>
      {showTimeDialog && (
        <div data-testid="time-dialog">
          <button
            onClick={() => {
              onTimeSave("10:00", "11:00");
              onTimeOpenChange(false);
            }}
          >
            picker-save
          </button>
          <button
            onClick={() => {
              onTimeSave(undefined, undefined);
              onTimeOpenChange(false);
            }}
          >
            picker-clear
          </button>
          <button onClick={() => onTimeOpenChange(false)}>picker-close</button>
        </div>
      )}
      {showCostDialog && (
        <div data-testid="cost-dialog">
          <button
            onClick={async () => {
              try {
                await onCostSave({ category: "food", amount: 99, currency: "USD", date: "2026-08-01" });
              } catch {
                /* CostDialog swallows the rethrow after surfacing its own toast */
              }
            }}
          >
            cost-save
          </button>
          {onCostRemove ? (
            <button
              onClick={async () => {
                try {
                  await onCostRemove();
                } catch {
                  /* CostDialog swallows the rethrow after surfacing its own toast */
                }
              }}
            >
              cost-remove
            </button>
          ) : null}
          <button onClick={() => onCostOpenChange(false)}>cost-close</button>
        </div>
      )}
      {showLocationDialog && (
        <div data-testid="location-dialog">
          <button
            onClick={() =>
              onLocationSave({
                address: "Tokyo",
                name: "Tokyo Tower",
                lat: 35.6586,
                lng: 139.7454,
              })
            }
          >
            loc-save
          </button>
          <button onClick={() => onLocationOpenChange(false)}>loc-close</button>
        </div>
      )}
      {showAddDocDialog && (
        <div data-testid="add-doc-dialog">
          <button onClick={() => onAddDocOpenChange(false)}>doc-close</button>
        </div>
      )}
      {showDeleteDialog && (
        <div data-testid="delete-event-dialog">
          <button onClick={() => onDeleteOpenChange(false)}>confirm-delete</button>
          <button onClick={() => onDeleteOpenChange(false)}>cancel-delete</button>
        </div>
      )}
    </>
  ),
}));

import { PlaceRow } from "./place-row";
import { TripEditAccessProvider } from "./trip-edit-access";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import { ExpenseCategory, type TripEvent } from "@/data/types";
import {
  ANCHOR_LABELS,
  RESERVATION_TYPE_META,
  formatAnchorDateTime,
  formatAnchorDateTimeRange,
} from "./reservation-type-badge";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

function ViewerWrapper({ children }: { children: React.ReactNode }) {
  return (
    <TripEditAccessProvider canEdit={false}>
      <Wrapper>{children}</Wrapper>
    </TripEditAccessProvider>
  );
}

const basePlace: TripEvent = {
  id: "ev-1",
  tripId: "trip-1",
  name: "Tokyo Tower",
  startAt: "2026-05-13T10:00:00Z",
  endAt: "2026-05-13T11:00:00Z",
  position: 0,
};

const linkedPlace: TripEvent = {
  id: "linked-1",
  tripId: "trip-1",
  name: "Check-in — Torel Avantgarde",
  startAt: "2030-06-16T15:00:00Z",
  position: new Date("2030-06-16T15:00:00Z").getTime(),
  linkedReservationId: "reservation-1",
  reservationType: "lodging",
};

describe("PlaceRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the event name", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("Tokyo Tower")).toBeInTheDocument();
  });

  it("shows formatted time range when startAt and endAt are present", () => {
    render(<PlaceRow dayDate="2026-05-13" place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    // When startAt/endAt are set the time button should NOT show "Add time"
    expect(screen.queryByRole("button", { name: /add time/i })).not.toBeInTheDocument();
    // At least one button contains a formatted time string (e.g. "10:00 AM – 11:00 AM")
    const allButtons = screen.getAllByRole("button");
    const timeBtn = allButtons.find((btn) => /\d:\d{2}\s*(AM|PM)/.test(btn.textContent ?? ""));
    expect(timeBtn).toBeDefined();
  });

  it("shows 'Add time' when no startAt", () => {
    const place: TripEvent = { id: "ev-2", name: "Free Time", position: 1 };
    render(<PlaceRow dayDate="2026-05-13" place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: /add time/i })).toBeInTheDocument();
  });

  it("delete button has a title attribute", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByTitle("Delete event")).toBeInTheDocument();
  });

  it("applies the highlight pulse ring class when isHighlighted is true", () => {
    render(<PlaceRow place={basePlace} id="event-ev-1" isHighlighted onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(document.getElementById("event-ev-1")?.firstElementChild).toHaveClass("highlight-pulse-ring");
  });

  it("does not apply the highlight pulse ring class by default", () => {
    render(<PlaceRow place={basePlace} id="event-ev-1" onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(document.getElementById("event-ev-1")?.firstElementChild).not.toHaveClass("highlight-pulse-ring");
  });

  it("calls onDelete with the event id when delete button is clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={onDelete} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByTitle("Delete event"));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith(basePlace.id);
  });

  it("note area is keyboard operable (role=button, tabIndex=0)", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const noteBtn = screen.getByRole("button", { name: /add a note/i });
    expect(noteBtn).toHaveAttribute("tabindex", "0");
  });

  it("note edit activates on Enter key", async () => {
    const user = userEvent.setup();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const noteBtn = screen.getByRole("button", { name: /add a note/i });
    noteBtn.focus();
    await user.keyboard("{Enter}");
    // Textarea replaces the button when editing is active
    expect(screen.getByRole("textbox", { name: "" })).toBeInTheDocument();
  });

  it("calls onUpdate with new name after editing and blur", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: "Tokyo Tower" }));
    const nameInput = screen.getByDisplayValue("Tokyo Tower");
    await user.clear(nameInput);
    await user.type(nameInput, "Shibuya Crossing");
    fireEvent.blur(nameInput);
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "Shibuya Crossing" }));
  });

  it("clicking note area shows textarea", async () => {
    const user = userEvent.setup();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const noteBtn = screen.getByRole("button", { name: /add a note/i });
    await user.click(noteBtn);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("blurring note textarea calls onUpdate with trimmed note", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a note/i }));
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Great place");
    fireEvent.blur(textarea);
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ note: "Great place" }));
  });

  it("pressing Escape in note textarea dismisses it without saving", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a note/i }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("shows 'Add location' button", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument();
  });

  it("shows 'Add cost' button", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole("button", { name: /add cost/i })).toBeInTheDocument();
  });

  it("shows cost amount when a linked expense is set", () => {
    const place = {
      ...basePlace,
      expense: {
        id: "expense-1",
        tripId: "trip-1",
        eventId: "ev-1",
        category: ExpenseCategory.Food,
        amount: 42.5,
        currency: "USD",
        date: "2026-08-01",
      },
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "$42.50" })).toBeInTheDocument();
  });

  it("shows the saved expense currency on the event cost chip", () => {
    const place = {
      ...basePlace,
      expense: {
        id: "expense-2",
        tripId: "trip-1",
        eventId: "ev-1",
        category: ExpenseCategory.Food,
        amount: 42.5,
        currency: "AED",
        date: "2026-08-01",
      },
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByRole("button", { name: "AED 42.50" })).toBeInTheDocument();
  });

  it("shows doc count button when docs are present", () => {
    const place = {
      ...basePlace,
      docs: [
        {
          id: "d1",
          name: "Plan.pdf",
          kind: "pdf" as const,
          scope: "event" as const,
        },
      ],
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByTitle("Show attached documents")).toBeInTheDocument();
  });

  it("renders location address when set", () => {
    const place = { ...basePlace, locationAddress: "Shibuya, Tokyo" };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByText("Shibuya, Tokyo")).toBeInTheDocument();
  });

  // ── onOpenMaps threading (handleOpenMaps / openExternalMaps) ───────────────

  it("clicking the location segment calls openExternalMaps with address, lat, lng, and label when Address is filled", async () => {
    const user = userEvent.setup();
    const place: TripEvent = {
      ...basePlace,
      locationName: "Tokyo Tower Entrance",
      locationAddress: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
      locationLat: 35.6586,
      locationLng: 139.7454,
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /open directions to tokyo tower entrance/i }));

    expect(openExternalMaps).toHaveBeenCalledWith({
      address: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
      lat: 35.6586,
      lng: 139.7454,
      label: "Tokyo Tower Entrance",
    });
  });

  it("does not call openExternalMaps when Address is empty (onOpenMaps not passed)", async () => {
    const user = userEvent.setup();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /add location/i }));

    expect(openExternalMaps).not.toHaveBeenCalled();
    expect(screen.getByTestId("location-dialog")).toBeInTheDocument();
  });

  it("clicking time button opens time dialog", async () => {
    const user = userEvent.setup();
    render(<PlaceRow dayDate="2026-05-13" place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const timeBtn = screen.getAllByRole("button").find((btn) => /\d:\d{2}\s*(AM|PM)/.test(btn.textContent ?? ""))!;
    await user.click(timeBtn);
    expect(screen.getByTestId("time-dialog")).toBeInTheDocument();
  });

  it("picker save with times calls onUpdate and hides picker", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow place={basePlace} dayDate="2026-05-13" onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const timeBtn = screen.getAllByRole("button").find((btn) => /\d:\d{2}\s*(AM|PM)/.test(btn.textContent ?? ""))!;
    await user.click(timeBtn);
    await user.click(screen.getByRole("button", { name: "picker-save" }));
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("time-dialog")).not.toBeInTheDocument();
  });

  it("picker save literal-tags startAt/endAt instead of converting through the runtime's local offset", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow place={basePlace} dayDate="2026-05-13" onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const timeBtn = screen.getAllByRole("button").find((btn) => /\d:\d{2}\s*(AM|PM)/.test(btn.textContent ?? ""))!;
    await user.click(timeBtn);
    // "time-dialog" mock's picker-save button always saves "10:00"/"11:00"
    await user.click(screen.getByRole("button", { name: "picker-save" }));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        startAt: "2026-05-13T10:00:00.000Z",
        endAt: "2026-05-13T11:00:00.000Z",
      })
    );
  });

  it("picker clear calls onUpdate with startAt/endAt undefined", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow dayDate="2026-05-13" place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const timeBtn = screen.getAllByRole("button").find((btn) => /\d:\d{2}\s*(AM|PM)/.test(btn.textContent ?? ""))!;
    await user.click(timeBtn);
    await user.click(screen.getByRole("button", { name: "picker-clear" }));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ startAt: undefined, endAt: undefined }));
  });

  it("picker close hides picker without calling onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow dayDate="2026-05-13" place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const timeBtn = screen.getAllByRole("button").find((btn) => /\d:\d{2}\s*(AM|PM)/.test(btn.textContent ?? ""))!;
    await user.click(timeBtn);
    await user.click(screen.getByRole("button", { name: "picker-close" }));
    expect(screen.queryByTestId("time-dialog")).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("clicking location button shows location dialog", async () => {
    const user = userEvent.setup();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add location/i }));
    expect(screen.getByTestId("location-dialog")).toBeInTheDocument();
  });

  it("location dialog save calls onUpdate with locationAddress", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add location/i }));
    await user.click(screen.getByRole("button", { name: "loc-save" }));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        locationAddress: "Tokyo",
        locationName: "Tokyo Tower",
        locationLat: 35.6586,
        locationLng: 139.7454,
      })
    );
  });

  it("clicking cost button shows cost dialog", async () => {
    const user = userEvent.setup();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add cost/i }));
    expect(screen.getByTestId("cost-dialog")).toBeInTheDocument();
  });

  it("cost dialog save creates a linked expense", async () => {
    const user = userEvent.setup();
    vi.mocked(createExpense).mockResolvedValueOnce({ id: "expense-1" });
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.click(screen.getByRole("button", { name: "cost-save" }));
    expect(createExpense).toHaveBeenCalledWith(
      "trip-1",
      expect.objectContaining({
        eventId: "ev-1",
        category: "food",
        amount: 99,
        currency: "USD",
        date: "2026-08-01",
      })
    );
  });

  it("clicking doc count button toggles docs block", async () => {
    const user = userEvent.setup();
    const place = {
      ...basePlace,
      docs: [
        {
          id: "d1",
          name: "Plan.pdf",
          kind: "pdf" as const,
          scope: "event" as const,
        },
      ],
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.queryByTestId("docs-block")).not.toBeInTheDocument();
    await user.click(screen.getByTitle("Show attached documents"));
    expect(screen.getByTestId("docs-block")).toBeInTheDocument();
    await user.click(screen.getByTitle("Show attached documents"));
    expect(screen.queryByTestId("docs-block")).not.toBeInTheDocument();
  });

  it("clicking add from the docs block opens the add-doc dialog", async () => {
    const user = userEvent.setup();
    const place = {
      ...basePlace,
      docs: [
        {
          id: "d1",
          name: "Plan.pdf",
          kind: "pdf" as const,
          scope: "event" as const,
        },
      ],
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByTitle("Show attached documents"));
    await user.click(screen.getByRole("button", { name: "add-doc-in-block" }));

    expect(screen.getByTestId("add-doc-dialog")).toBeInTheDocument();
  });

  it("clicking attach button shows add-doc dialog", async () => {
    const user = userEvent.setup();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByTitle("Attach document"));
    expect(screen.getByTestId("add-doc-dialog")).toBeInTheDocument();
  });

  it("renders dragHandle when provided", () => {
    render(
      <PlaceRow
        place={basePlace}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        dragHandle={<span data-testid="drag-handle">drag</span>}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
  });

  it("trash button has mobile-always-visible and desktop-hover-only CSS classes", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const trashBtn = screen.getByTitle("Delete event");
    expect(trashBtn.className).toContain("opacity-100");
    expect(trashBtn.className).toContain("sm:opacity-0");
    expect(trashBtn.className).toContain("sm:group-hover:opacity-100");
  });

  it("drag handle wrapper has mobile-always-visible and desktop-hover-only CSS classes", () => {
    render(
      <PlaceRow
        place={basePlace}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        dragHandle={<span data-testid="drag-handle">drag</span>}
      />,
      { wrapper: Wrapper }
    );
    const dragHandleWrapper = screen.getByTestId("drag-handle").parentElement;
    expect(dragHandleWrapper?.className).toContain("opacity-100");
    expect(dragHandleWrapper?.className).toContain("sm:opacity-0");
    expect(dragHandleWrapper?.className).toContain("sm:group-hover:opacity-100");
  });

  it("isLast prop omits the connector line", () => {
    const { container } = render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} isLast />, {
      wrapper: Wrapper,
    });
    expect(container.firstChild).toBeInTheDocument();
  });

  it("saveName with same value does not call onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: "Tokyo Tower" }));
    const nameInput = screen.getByDisplayValue("Tokyo Tower");
    fireEvent.blur(nameInput);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("pressing Enter in name input saves and hides input", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: "Tokyo Tower" }));
    const nameInput = screen.getByDisplayValue("Tokyo Tower");
    await user.clear(nameInput);
    await user.type(nameInput, "Akihabara");
    await user.keyboard("{Enter}");
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "Akihabara" }));
    expect(screen.queryByDisplayValue("Akihabara")).not.toBeInTheDocument();
  });

  it("pressing Escape in name input cancels edit", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: "Tokyo Tower" }));
    await user.keyboard("{Escape}");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("Tokyo Tower")).not.toBeInTheDocument();
  });

  it("Space key on note area activates editing", async () => {
    const user = userEvent.setup();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const noteBtn = screen.getByRole("button", { name: /add a note/i });
    noteBtn.focus();
    await user.keyboard(" ");
    expect(screen.getByRole("textbox", { name: "" })).toBeInTheDocument();
  });

  it("note textarea onUpdate not called when note unchanged", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const place = { ...basePlace, note: "existing note" };
    render(<PlaceRow place={place} onUpdate={onUpdate} onDelete={vi.fn()} />, { wrapper: Wrapper });
    const noteBtn = screen.getByText("existing note");
    await user.click(noteBtn);
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("renders with only startAt (no endAt) — single-time label", () => {
    const place: TripEvent = { id: "ev-3", name: "Solo Event", startAt: "2026-05-13T14:00:00Z", position: 0 };
    render(<PlaceRow dayDate="2026-05-13" place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });
    const allButtons = screen.getAllByRole("button");
    const timeBtn = allButtons.find((btn) => /\d:\d{2}\s*(AM|PM)/.test(btn.textContent ?? ""));
    expect(timeBtn).toBeDefined();
  });

  it("renders MapPin icon as the event type indicator", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const icons = screen.getAllByTestId("map-pin-icon");
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  it("timeline MapPin icon has strokeWidth 1.5", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const icons = screen.getAllByTestId("map-pin-icon");
    expect(icons[0]).toHaveAttribute("data-stroke-width", "1.5");
  });

  it("renders Linked Event with Hotel icon instead of MapPin", () => {
    render(<PlaceRow place={linkedPlace} onUpdate={vi.fn()} onDelete={vi.fn()} onLinkedEventTap={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByTestId("hotel-icon")).toHaveAttribute("data-stroke-width", "1.5");
    expect(screen.queryByTestId("map-pin-icon")).not.toBeInTheDocument();
  });

  it("renders Linked Event with 'Linked' badge after event name", () => {
    render(<PlaceRow place={linkedPlace} onUpdate={vi.fn()} onDelete={vi.fn()} onLinkedEventTap={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("Linked")).toBeInTheDocument();
    expect(screen.getByText("Linked")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders Linked Event with correct aria-label", () => {
    const anchorLabel = ANCHOR_LABELS.lodging.start;
    const expectedLabel = `${anchorLabel}: ${formatAnchorDateTime(linkedPlace.startAt!)} — Torel Avantgarde, Linked, opens Reservations`;

    render(<PlaceRow place={linkedPlace} onUpdate={vi.fn()} onDelete={vi.fn()} onLinkedEventTap={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByRole("button", { name: expectedLabel })).toBeInTheDocument();
  });

  it("renders Linked Event meta line with anchor label and reservation type", () => {
    const anchorLabel = ANCHOR_LABELS.lodging.start;
    const reservationLabel = RESERVATION_TYPE_META.lodging.label;
    const expectedMeta = `${anchorLabel}: ${formatAnchorDateTime(linkedPlace.startAt!)} — from ${reservationLabel} reservation`;

    render(<PlaceRow place={linkedPlace} onUpdate={vi.fn()} onDelete={vi.fn()} onLinkedEventTap={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText(expectedMeta)).toBeInTheDocument();
  });

  it("calls onLinkedEventTap when Linked Event row is activated", async () => {
    const user = userEvent.setup();
    const onLinkedEventTap = vi.fn();

    render(<PlaceRow place={linkedPlace} onUpdate={vi.fn()} onDelete={vi.fn()} onLinkedEventTap={onLinkedEventTap} />, {
      wrapper: Wrapper,
    });

    await user.click(screen.getByRole("button", { name: /opens Reservations$/i }));

    expect(onLinkedEventTap).toHaveBeenCalledWith("reservation-1");
  });

  it("renders manual event normally without linked event indicators", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.queryByText("Linked")).not.toBeInTheDocument();
  });

  it("keeps the full provider name intact when it contains an em dash separator", () => {
    const place: TripEvent = {
      ...linkedPlace,
      name: "Check-in — Suites — Downtown",
    };
    const expectedLabel = `Check-in: ${formatAnchorDateTime(place.startAt!)} — Suites — Downtown, Linked, opens Reservations`;

    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} onLinkedEventTap={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByRole("button", { name: expectedLabel })).toBeInTheDocument();
  });

  // ── Combined same-day Linked Event (startAt + endAt both set) ──────────────

  const combinedLinkedPlace: TripEvent = {
    id: "linked-2",
    tripId: "trip-1",
    name: "Delta",
    startAt: "2030-06-16T12:00:00Z",
    endAt: "2030-06-16T20:00:00Z",
    position: new Date("2030-06-16T12:00:00Z").getTime(),
    linkedReservationId: "reservation-2",
    reservationType: "flight",
  };

  it("renders a single row for a Linked Event whose start and end are on the same day", () => {
    render(<PlaceRow place={combinedLinkedPlace} onUpdate={vi.fn()} onDelete={vi.fn()} onLinkedEventTap={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText("Delta")).toBeInTheDocument();
    expect(screen.queryByText(/Departure/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Arrival/)).not.toBeInTheDocument();
  });

  it("renders the combined Linked Event meta line with the start–end time range", () => {
    const expectedMeta = `${formatAnchorDateTimeRange(combinedLinkedPlace.startAt!, combinedLinkedPlace.endAt!)} — from ${RESERVATION_TYPE_META.flight.label} reservation`;

    render(<PlaceRow place={combinedLinkedPlace} onUpdate={vi.fn()} onDelete={vi.fn()} onLinkedEventTap={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText(expectedMeta)).toBeInTheDocument();
  });

  it("renders the combined Linked Event with a name-only aria-label and the time range", () => {
    const expectedLabel = `Delta: ${formatAnchorDateTimeRange(combinedLinkedPlace.startAt!, combinedLinkedPlace.endAt!)}, Linked, opens Reservations`;

    render(<PlaceRow place={combinedLinkedPlace} onUpdate={vi.fn()} onDelete={vi.fn()} onLinkedEventTap={vi.fn()} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByRole("button", { name: expectedLabel })).toBeInTheDocument();
  });

  it("calls onLinkedEventTap when a combined same-day Linked Event row is activated", async () => {
    const user = userEvent.setup();
    const onLinkedEventTap = vi.fn();

    render(
      <PlaceRow
        place={combinedLinkedPlace}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onLinkedEventTap={onLinkedEventTap}
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: /opens Reservations$/i }));

    expect(onLinkedEventTap).toHaveBeenCalledWith("reservation-2");
  });

  // ── isDraft mode ──────────────────────────────────────────────────────────

  it("isDraft renders name input focused with empty placeholder", () => {
    const draftPlace: TripEvent = { id: "draft", name: "", position: 0 };
    render(
      <PlaceRow
        place={draftPlace}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isDraft
        onCreate={vi.fn()}
        onCancelDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("isDraft Enter with content calls onCreate and not onUpdate", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const onUpdate = vi.fn();
    const draftPlace: TripEvent = { id: "draft", name: "", position: 0 };
    render(
      <PlaceRow
        place={draftPlace}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        isDraft
        onCreate={onCreate}
        onCancelDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    const input = screen.getByRole("textbox");
    await user.type(input, "New Stop");
    await user.keyboard("{Enter}");
    expect(onCreate).toHaveBeenCalledWith("New Stop");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("isDraft Escape calls onCancelDraft", async () => {
    const user = userEvent.setup();
    const onCancelDraft = vi.fn();
    const draftPlace: TripEvent = { id: "draft", name: "", position: 0 };
    render(
      <PlaceRow
        place={draftPlace}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isDraft
        onCreate={vi.fn()}
        onCancelDraft={onCancelDraft}
      />,
      { wrapper: Wrapper }
    );
    await user.keyboard("{Escape}");
    expect(onCancelDraft).toHaveBeenCalled();
  });

  it("isDraft blur with empty content calls onCancelDraft", () => {
    const onCancelDraft = vi.fn();
    const draftPlace: TripEvent = { id: "draft", name: "", position: 0 };
    render(
      <PlaceRow
        place={draftPlace}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isDraft
        onCreate={vi.fn()}
        onCancelDraft={onCancelDraft}
      />,
      { wrapper: Wrapper }
    );
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onCancelDraft).toHaveBeenCalled();
  });

  it("isDraft blur with content calls onCreate", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const draftPlace: TripEvent = { id: "draft", name: "", position: 0 };
    render(
      <PlaceRow
        place={draftPlace}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        isDraft
        onCreate={onCreate}
        onCancelDraft={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    await user.type(screen.getByRole("textbox"), "Tokyo Museum");
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onCreate).toHaveBeenCalledWith("Tokyo Museum");
  });

  it("clicking delete button on event WITH docs shows DeleteEventDialog, not onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const place = {
      ...basePlace,
      docs: [{ id: "d1", name: "Pass.pdf", kind: "pdf" as const, scope: "event" as const }],
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={onDelete} />, { wrapper: Wrapper });
    await user.click(screen.getByTitle("Delete event"));
    expect(screen.getByTestId("delete-event-dialog")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("clicking delete button on event WITHOUT docs calls onDelete directly without dialog", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={onDelete} />, { wrapper: Wrapper });
    await user.click(screen.getByTitle("Delete event"));
    expect(onDelete).toHaveBeenCalledWith(basePlace.id);
    expect(screen.queryByTestId("delete-event-dialog")).not.toBeInTheDocument();
  });

  it("confirming delete from DeleteEventDialog does NOT call parent's onDelete (dialog owns the server action)", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const place = {
      ...basePlace,
      docs: [{ id: "d1", name: "Pass.pdf", kind: "pdf" as const, scope: "event" as const }],
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={onDelete} />, { wrapper: Wrapper });
    await user.click(screen.getByTitle("Delete event"));
    await user.click(screen.getByRole("button", { name: "confirm-delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByTestId("delete-event-dialog")).not.toBeInTheDocument();
  });

  it("canceling DeleteEventDialog does not call onDelete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const place = {
      ...basePlace,
      docs: [{ id: "d1", name: "Pass.pdf", kind: "pdf" as const, scope: "event" as const }],
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={onDelete} />, { wrapper: Wrapper });
    await user.click(screen.getByTitle("Delete event"));
    await user.click(screen.getByRole("button", { name: "cancel-delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByTestId("delete-event-dialog")).not.toBeInTheDocument();
  });

  // ── Cost save / remove (handleExpenseSave / handleExpenseRemove) ───────────

  const placeWithExpense: TripEvent = {
    ...basePlace,
    expense: {
      id: "expense-1",
      tripId: "trip-1",
      eventId: "ev-1",
      category: ExpenseCategory.Food,
      amount: 10,
      currency: "USD",
      date: "2026-08-01",
    },
  };

  it("cost save updates the existing expense instead of creating a new one", async () => {
    const user = userEvent.setup();
    vi.mocked(updateExpense).mockResolvedValueOnce(undefined);
    render(<PlaceRow place={placeWithExpense} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: "$10.00" }));
    await user.click(screen.getByRole("button", { name: "cost-save" }));

    expect(updateExpense).toHaveBeenCalledWith(
      "expense-1",
      expect.objectContaining({ eventId: "ev-1", amount: 99, currency: "USD" })
    );
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("cost save without a tripId surfaces a toast and skips the server action", async () => {
    const user = userEvent.setup();
    const place: TripEvent = { ...basePlace, tripId: undefined };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.click(screen.getByRole("button", { name: "cost-save" }));

    expect(toastError).toHaveBeenCalledWith("Failed to save cost.");
    expect(createExpense).not.toHaveBeenCalled();
    expect(updateExpense).not.toHaveBeenCalled();
  });

  it("cost save surfaces the error message when the create action fails", async () => {
    const user = userEvent.setup();
    vi.mocked(createExpense).mockRejectedValueOnce(new Error("save boom"));
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.click(screen.getByRole("button", { name: "cost-save" }));

    expect(toastError).toHaveBeenCalledWith("save boom");
  });

  it("cost remove deletes the expense and clears the amount", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteExpense).mockResolvedValueOnce(undefined);
    render(<PlaceRow place={placeWithExpense} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: "$10.00" }));
    await user.click(screen.getByRole("button", { name: "cost-remove" }));

    expect(deleteExpense).toHaveBeenCalledWith("expense-1");
    expect(screen.queryByRole("button", { name: "$10.00" })).not.toBeInTheDocument();
  });

  it("cost remove is a no-op when there is no expense yet", async () => {
    const user = userEvent.setup();
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /add cost/i }));
    await user.click(screen.getByRole("button", { name: "cost-remove" }));

    expect(deleteExpense).not.toHaveBeenCalled();
  });

  it("cost remove surfaces the error message when the delete action fails", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteExpense).mockRejectedValueOnce(new Error("remove boom"));
    render(<PlaceRow place={placeWithExpense} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: "$10.00" }));
    await user.click(screen.getByRole("button", { name: "cost-remove" }));

    expect(toastError).toHaveBeenCalledWith("remove boom");
  });

  it("passes hasScheduleConflict through to the action bar's conflict icon", () => {
    render(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} hasScheduleConflict />, {
      wrapper: Wrapper,
    });

    expect(screen.getByRole("button", { name: "Schedule conflict" })).toBeInTheDocument();
  });

  it("does not show a conflict icon when hasScheduleConflict is false or omitted", () => {
    const { rerender } = render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} hasScheduleConflict={false} />,
      { wrapper: Wrapper }
    );
    expect(screen.queryByRole("button", { name: "Schedule conflict" })).not.toBeInTheDocument();

    rerender(<PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Schedule conflict" })).not.toBeInTheDocument();
  });
});

describe("PlaceRow for a viewer", () => {
  it("hides the drag handle and Delete event", () => {
    render(
      <PlaceRow
        place={basePlace}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        dragHandle={<span data-testid="drag-handle">drag</span>}
      />,
      { wrapper: ViewerWrapper }
    );
    expect(screen.queryByTestId("drag-handle")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete event")).not.toBeInTheDocument();
  });

  it("lists attached documents without offering to add one", async () => {
    const user = userEvent.setup();
    const place: TripEvent = {
      ...basePlace,
      docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf", scope: "event" }],
    };
    render(<PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />, { wrapper: ViewerWrapper });

    await user.click(screen.getByTitle("Show attached documents"));
    expect(screen.getByText("Plan.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "add-doc-in-block" })).not.toBeInTheDocument();
  });
});

describe("PlaceRow time on a day without a date", () => {
  it("offers a date hint instead of the time dialog", () => {
    render(
      <PlaceRow place={{ ...basePlace, startAt: undefined, endAt: undefined }} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      {
        wrapper: Wrapper,
      }
    );
    expect(screen.getByText("Set dates to add a time")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add time/i })).not.toBeInTheDocument();
  });

  it("keeps Add time on a dated day", () => {
    render(
      <PlaceRow
        place={{ ...basePlace, startAt: undefined, endAt: undefined }}
        dayDate="2026-05-13"
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByRole("button", { name: /add time/i })).toBeInTheDocument();
  });
});
