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
        <div data-testid="gap-type-picker-popup" {...props}>
          {children}
        </div>
      ) : null;
    },
  };
});

vi.mock("./type-picker", () => ({
  TypePicker: ({
    onSelect,
    onDismiss,
  }: {
    onSelect: (type: (typeof ItineraryItemType)[keyof typeof ItineraryItemType]) => void;
    onDismiss: () => void;
  }) => (
    <div data-testid="type-picker">
      <button title="Add event" onClick={() => onSelect(ItineraryItemType.Event)} />
      <button title="Add note" onClick={() => onSelect(ItineraryItemType.Note)} />
      <button title="dismiss" onClick={onDismiss} />
    </div>
  ),
}));

import { GapZone } from "./gap-zone";
import { TripEditAccessProvider } from "./trip-edit-access";

describe("GapZone", () => {
  it("renders the insert button in inactive state", () => {
    render(<GapZone gapKey="ti-0" isActive={false} onOpen={vi.fn()} onSelectType={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTitle("Insert item here")).toBeInTheDocument();
    expect(screen.queryByTestId("type-picker")).not.toBeInTheDocument();
  });

  it("renders TypePicker in active state (no insert button)", () => {
    render(<GapZone gapKey="ti-0" isActive={true} onOpen={vi.fn()} onSelectType={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("type-picker")).toBeInTheDocument();
    expect(screen.getByTitle("Insert item here")).toBeInTheDocument();
    expect(screen.getByTestId("gap-type-picker-popup")).toBeInTheDocument();
  });

  it("clicking the insert button calls onOpen", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<GapZone gapKey="ti-0" isActive={false} onOpen={onOpen} onSelectType={vi.fn()} onDismiss={vi.fn()} />);
    await user.click(screen.getByTitle("Insert item here"));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("selecting a type from TypePicker calls onSelectType with that type", async () => {
    const user = userEvent.setup();
    const onSelectType = vi.fn();
    render(<GapZone gapKey="ti-0" isActive={true} onOpen={vi.fn()} onSelectType={onSelectType} onDismiss={vi.fn()} />);
    await user.click(screen.getByTitle("Add note"));
    expect(onSelectType).toHaveBeenCalledWith(ItineraryItemType.Note);
  });

  it("onDismiss is wired into TypePicker", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<GapZone gapKey="ti-0" isActive={true} onOpen={vi.fn()} onSelectType={vi.fn()} onDismiss={onDismiss} />);
    await user.click(screen.getByTitle("dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("GapZone for a viewer", () => {
  it("keeps the spacing between items but offers no insert control", () => {
    const { container } = render(
      <TripEditAccessProvider canEdit={false}>
        <GapZone gapKey="ti-0" isActive onOpen={vi.fn()} onSelectType={vi.fn()} onDismiss={vi.fn()} />
      </TripEditAccessProvider>
    );
    expect(screen.queryByTitle("Insert item here")).not.toBeInTheDocument();
    expect(screen.queryByTestId("type-picker")).not.toBeInTheDocument();
    expect(container).not.toBeEmptyDOMElement();
  });
});
