// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./time-dialog", () => ({
  TimeDialog: ({
    open,
    onOpenChange,
    onSave,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onSave: (t?: string) => void;
  }) =>
    open ? (
      <button
        onClick={() => {
          onSave("10:00");
          onOpenChange(false);
        }}
      >
        time-save
      </button>
    ) : null,
}));
vi.mock("./cost-dialog", () => ({
  CostDialog: ({
    open,
    onOpenChange,
    onSave,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onSave: (c?: number) => void;
  }) =>
    open ? (
      <button
        onClick={() => {
          onSave(50);
          onOpenChange(false);
        }}
      >
        cost-save
      </button>
    ) : null,
}));
vi.mock("./location-dialog", () => ({
  LocationDialog: ({
    open,
    onOpenChange,
    onSave,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onSave: (a?: string) => void;
  }) =>
    open ? (
      <button
        onClick={() => {
          onSave("Paris");
          onOpenChange(false);
        }}
      >
        loc-save
      </button>
    ) : null,
}));
vi.mock("./add-doc-dialog", () => ({
  AddDocDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? <button onClick={() => onOpenChange(false)}>doc-close</button> : null,
}));
vi.mock("./delete-event-dialog", () => ({
  DeleteEventDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) =>
    open ? (
      <>
        <button onClick={() => onOpenChange(false)}>confirm-delete</button>
        <button onClick={() => onOpenChange(false)}>cancel-delete</button>
      </>
    ) : null,
}));

import { PlaceRowDialogs } from "./place-row-dialogs";
import type { TripEvent } from "@/data/types";

const place: TripEvent = {
  id: "ev-1",
  name: "Museum",
  docs: [{ id: "d1", name: "Pass.pdf", kind: "pdf", scope: "event", offline: false }],
};

const defaultProps = {
  place,
  tripDocs: [],
  showTimeDialog: false,
  onTimeOpenChange: vi.fn(),
  onTimeSave: vi.fn(),
  showCostDialog: false,
  onCostOpenChange: vi.fn(),
  onCostSave: vi.fn(),
  showLocationDialog: false,
  onLocationOpenChange: vi.fn(),
  onLocationSave: vi.fn(),
  showAddDocDialog: false,
  onAddDocOpenChange: vi.fn(),
  showDeleteDialog: false,
  onDeleteOpenChange: vi.fn(),
};

describe("PlaceRowDialogs", () => {
  it("renders nothing when all dialogs are closed", () => {
    const { container } = render(<PlaceRowDialogs {...defaultProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders TimeDialog when showTimeDialog is true", () => {
    render(<PlaceRowDialogs {...defaultProps} showTimeDialog />);
    expect(screen.getByRole("button", { name: "time-save" })).toBeInTheDocument();
  });

  it("onTimeSave callback is wired through", async () => {
    const user = userEvent.setup();
    const onTimeSave = vi.fn();
    render(<PlaceRowDialogs {...defaultProps} showTimeDialog onTimeSave={onTimeSave} />);
    await user.click(screen.getByRole("button", { name: "time-save" }));
    expect(onTimeSave).toHaveBeenCalled();
  });

  it("renders DeleteEventDialog when showDeleteDialog is true", () => {
    render(<PlaceRowDialogs {...defaultProps} showDeleteDialog />);
    expect(screen.getByRole("button", { name: "confirm-delete" })).toBeInTheDocument();
  });

  it("onDeleteOpenChange callback is wired through for DeleteEventDialog", async () => {
    const user = userEvent.setup();
    const onDeleteOpenChange = vi.fn();
    render(<PlaceRowDialogs {...defaultProps} showDeleteDialog onDeleteOpenChange={onDeleteOpenChange} />);
    await user.click(screen.getByRole("button", { name: "confirm-delete" }));
    expect(onDeleteOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders AddDocDialog when showAddDocDialog is true", () => {
    render(<PlaceRowDialogs {...defaultProps} showAddDocDialog />);
    expect(screen.getByRole("button", { name: "doc-close" })).toBeInTheDocument();
  });

  it("renders CostDialog when showCostDialog is true", () => {
    render(<PlaceRowDialogs {...defaultProps} showCostDialog />);
    expect(screen.getByRole("button", { name: "cost-save" })).toBeInTheDocument();
  });

  it("renders LocationDialog when showLocationDialog is true", () => {
    render(<PlaceRowDialogs {...defaultProps} showLocationDialog />);
    expect(screen.getByRole("button", { name: "loc-save" })).toBeInTheDocument();
  });

  it("passes startAt and endAt as formatted times to TimeDialog", () => {
    const placeWithTimes: TripEvent = {
      ...place,
      startAt: "2026-07-01T10:00:00Z",
      endAt: "2026-07-01T11:00:00Z",
    };
    render(<PlaceRowDialogs {...defaultProps} place={placeWithTimes} showTimeDialog />);
    expect(screen.getByRole("button", { name: "time-save" })).toBeInTheDocument();
  });
});
