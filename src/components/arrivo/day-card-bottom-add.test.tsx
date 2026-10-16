import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItineraryItemType } from "@/data/types";

vi.mock("@/components/ui/popover", () => {
  const PopoverOpenContext = React.createContext(false);
  return {
    Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <PopoverOpenContext.Provider value={Boolean(open)}>{children}</PopoverOpenContext.Provider>
    ),
    PopoverTrigger: ({ children, ...props }: React.ComponentProps<"button">) => <button {...props}>{children}</button>,
    PopoverContent: ({ children, ...props }: React.ComponentProps<"div">) => {
      const isOpen = React.useContext(PopoverOpenContext);
      return isOpen ? (
        <div data-testid="bottom-type-picker-popup" {...props}>
          {children}
        </div>
      ) : null;
    },
  };
});

interface MockTypePickerProps {
  onSelect: (type: (typeof ItineraryItemType)[keyof typeof ItineraryItemType]) => void;
  onDismiss: () => void;
  onOpenPackingListPicker?: () => void;
}

vi.mock("./type-picker", () => ({
  TypePicker: ({ onSelect, onDismiss, onOpenPackingListPicker }: MockTypePickerProps) => (
    <div data-testid="type-picker">
      <button onClick={() => onSelect(ItineraryItemType.Checklist)}>Add checklist</button>
      <button onClick={onDismiss}>Dismiss</button>
      {onOpenPackingListPicker && <button onClick={onOpenPackingListPicker}>Insert packing list</button>}
    </div>
  ),
}));

import { DayCardBottomAdd } from "./day-card-bottom-add";
import { TripEditAccessProvider } from "./trip-edit-access";

describe("DayCardBottomAdd", () => {
  it("renders the bottom-add button when gap is closed", () => {
    render(
      <DayCardBottomAdd
        dayNumber={2}
        openGapKey={null}
        bottomInsertPosition={3}
        openGap={vi.fn()}
        activateDraft={vi.fn()}
        closeGap={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Add a place to day 2/ })).toBeInTheDocument();
  });

  it("clicking the bottom-add button calls openGap with 'bottom'", async () => {
    const openGap = vi.fn();
    const user = userEvent.setup();
    render(
      <DayCardBottomAdd
        dayNumber={2}
        openGapKey={null}
        bottomInsertPosition={3}
        openGap={openGap}
        activateDraft={vi.fn()}
        closeGap={vi.fn()}
      />
    );
    await user.click(screen.getByRole("button", { name: /Add a place to day 2/ }));
    expect(openGap).toHaveBeenCalledWith("bottom");
  });

  it("shows TypePicker as popup when openGapKey is 'bottom' and keeps trigger button visible", () => {
    render(
      <DayCardBottomAdd
        dayNumber={2}
        openGapKey="bottom"
        bottomInsertPosition={3}
        openGap={vi.fn()}
        activateDraft={vi.fn()}
        closeGap={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /Add a place to day 2/ })).toBeInTheDocument();
    expect(screen.getByTestId("bottom-type-picker-popup")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add checklist" })).toBeInTheDocument();
  });

  it("Backpack option absent when onOpenPackingListPicker is omitted", () => {
    render(
      <DayCardBottomAdd
        dayNumber={2}
        openGapKey="bottom"
        bottomInsertPosition={3}
        openGap={vi.fn()}
        activateDraft={vi.fn()}
        closeGap={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Insert packing list" })).not.toBeInTheDocument();
  });

  it("Backpack option present when onOpenPackingListPicker is provided", () => {
    render(
      <DayCardBottomAdd
        dayNumber={2}
        openGapKey="bottom"
        bottomInsertPosition={3}
        openGap={vi.fn()}
        activateDraft={vi.fn()}
        closeGap={vi.fn()}
        onOpenPackingListPicker={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Insert packing list" })).toBeInTheDocument();
  });

  it("clicking Backpack calls onOpenPackingListPicker with bottomInsertPosition", async () => {
    const onOpenPackingListPicker = vi.fn();
    const user = userEvent.setup();
    render(
      <DayCardBottomAdd
        dayNumber={2}
        openGapKey="bottom"
        bottomInsertPosition={5}
        openGap={vi.fn()}
        activateDraft={vi.fn()}
        closeGap={vi.fn()}
        onOpenPackingListPicker={onOpenPackingListPicker}
      />
    );
    await user.click(screen.getByRole("button", { name: "Insert packing list" }));
    expect(onOpenPackingListPicker).toHaveBeenCalledWith(5);
  });
});

describe("DayCardBottomAdd for a viewer", () => {
  it("renders nothing", () => {
    const { container } = render(
      <TripEditAccessProvider canEdit={false}>
        <DayCardBottomAdd
          dayNumber={2}
          openGapKey={null}
          bottomInsertPosition={3}
          openGap={vi.fn()}
          activateDraft={vi.fn()}
          closeGap={vi.fn()}
        />
      </TripEditAccessProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
