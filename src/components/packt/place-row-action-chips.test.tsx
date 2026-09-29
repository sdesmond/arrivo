import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { toastWarning } = vi.hoisted(() => ({ toastWarning: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { warning: toastWarning },
}));

import { PlaceRowTimeChip, ReadOnlyChip } from "./place-row-action-chips";
import { TripEditAccessProvider } from "./trip-edit-access";

function renderAsViewer(ui: React.ReactElement) {
  return render(<TripEditAccessProvider canEdit={false}>{ui}</TripEditAccessProvider>);
}

describe("PlaceRowTimeChip", () => {
  it("opens the time dialog from Add time when no time is set", async () => {
    const user = userEvent.setup();
    const onOpenTime = vi.fn();
    render(<PlaceRowTimeChip onOpenTime={onOpenTime} />);
    await user.click(screen.getByRole("button", { name: /add time/i }));
    expect(onOpenTime).toHaveBeenCalledOnce();
  });

  it("formats a start-only time", () => {
    render(<PlaceRowTimeChip startAt="2026-08-01T14:05:00Z" onOpenTime={vi.fn()} />);
    expect(screen.getByRole("button", { name: "2:05 PM" })).toBeInTheDocument();
  });

  it("explains a schedule conflict with a toast", async () => {
    const user = userEvent.setup();
    render(<PlaceRowTimeChip hasScheduleConflict onOpenTime={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Schedule conflict" }));
    expect(toastWarning).toHaveBeenCalledOnce();
  });

  describe("on a day without a date", () => {
    it("explains that a date is needed instead of opening the time dialog", async () => {
      const user = userEvent.setup();
      const onOpenTime = vi.fn();
      render(<PlaceRowTimeChip hasDayDate={false} onOpenTime={onOpenTime} />);

      expect(screen.queryByRole("button", { name: /add time/i })).not.toBeInTheDocument();
      await user.click(screen.getByText("Set dates to add a time"));
      expect(onOpenTime).not.toHaveBeenCalled();
    });

    it("shows an existing time as text so it cannot be overwritten without a date", () => {
      render(<PlaceRowTimeChip hasDayDate={false} startAt="2026-08-01T09:00:00Z" onOpenTime={vi.fn()} />);
      expect(screen.getByText("9:00 AM")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("shows a viewer nothing rather than the date hint", () => {
      const { container } = renderAsViewer(<PlaceRowTimeChip hasDayDate={false} onOpenTime={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe("for a viewer", () => {
    it("shows a set time as text that opens nothing", async () => {
      const user = userEvent.setup();
      const onOpenTime = vi.fn();
      renderAsViewer(
        <PlaceRowTimeChip startAt="2026-08-01T09:00:00Z" endAt="2026-08-01T10:00:00Z" onOpenTime={onOpenTime} />
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      await user.click(screen.getByText("9:00 AM – 10:00 AM"));
      expect(onOpenTime).not.toHaveBeenCalled();
    });

    it("renders nothing without a time", () => {
      const { container } = renderAsViewer(<PlaceRowTimeChip onOpenTime={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
    });

    it("keeps the read-only time beside a schedule conflict warning", () => {
      renderAsViewer(<PlaceRowTimeChip startAt="2026-08-01T09:00:00Z" hasScheduleConflict onOpenTime={vi.fn()} />);
      expect(screen.getByText("9:00 AM")).toBeInTheDocument();
      expect(screen.getAllByRole("button")).toHaveLength(1);
    });
  });
});

describe("ReadOnlyChip", () => {
  it("renders its content as non-interactive text", () => {
    render(<ReadOnlyChip>$12.50</ReadOnlyChip>);
    expect(screen.getByText("$12.50").tagName).toBe("SPAN");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
