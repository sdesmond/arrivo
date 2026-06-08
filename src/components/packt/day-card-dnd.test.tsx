import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./day-card-dnd", () => ({
  DayCardDnd: ({
    makeGapProps,
  }: {
    makeGapProps: (gapKey: string, insertAtPosition: number) => { onOpenPackingListPicker?: () => void };
  }) => {
    const gapProps = makeGapProps("gap-0", 1);
    return (
      <div data-testid="day-card-dnd">
        {gapProps.onOpenPackingListPicker && (
          <button onClick={gapProps.onOpenPackingListPicker}>Gap packing picker</button>
        )}
      </div>
    );
  },
}));

vi.mock("./day-card-bottom-add", () => ({
  DayCardBottomAdd: ({
    dayNumber,
    onOpenPackingListPicker,
  }: {
    dayNumber: number;
    onOpenPackingListPicker?: (pos: number) => void;
  }) => (
    <div>
      <span data-testid="day-number">{dayNumber}</span>
      {onOpenPackingListPicker && <button onClick={() => onOpenPackingListPicker(0)}>Open packing picker</button>}
    </div>
  ),
}));

import { DayCardBody } from "./day-card-body";
import type { DayItinerary } from "@/data/types";

const day: DayItinerary = {
  id: "day-1",
  dayNumber: 3,
  date: "2026-06-01",
  label: "Day 3",
  events: [],
  notes: [],
  checklists: [],
};

describe("DayCardBody — onOpenPackingListPicker threading", () => {
  it("does not render the packing picker button when prop is omitted", () => {
    render(<DayCardBody day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Open packing picker" })).not.toBeInTheDocument();
  });

  it("threads onOpenPackingListPicker to DayCardBottomAdd when provided", async () => {
    const onOpenPackingListPicker = vi.fn();
    const user = userEvent.setup();
    render(
      <DayCardBody
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onOpenPackingListPicker={onOpenPackingListPicker}
      />
    );
    await user.click(screen.getByRole("button", { name: "Open packing picker" }));
    expect(onOpenPackingListPicker).toHaveBeenCalledWith(0);
  });

  it("threads onOpenPackingListPicker through makeGapProps to gap zones", async () => {
    const onOpenPackingListPicker = vi.fn();
    const user = userEvent.setup();
    render(
      <DayCardBody
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onOpenPackingListPicker={onOpenPackingListPicker}
      />
    );
    await user.click(screen.getByRole("button", { name: "Gap packing picker" }));
    expect(onOpenPackingListPicker).toHaveBeenCalledWith(1);
  });

  it("does not include onOpenPackingListPicker in gap props when prop is omitted", () => {
    render(<DayCardBody day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Gap packing picker" })).not.toBeInTheDocument();
  });
});
