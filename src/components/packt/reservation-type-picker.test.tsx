import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReservationType } from "@/data/types";
import { ReservationTypePicker } from "./reservation-type-picker";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: React.MouseEventHandler }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

describe("ReservationTypePicker", () => {
  it("renders the Add Reservation trigger", () => {
    render(<ReservationTypePicker onSelectType={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add reservation/i })).toBeInTheDocument();
  });

  it("renders an item for each reservation type", () => {
    render(<ReservationTypePicker onSelectType={vi.fn()} />);
    expect(screen.getByRole("button", { name: /lodging/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rental car/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cruise/i })).toBeInTheDocument();
  });

  it("calls onSelectType with the selected type", async () => {
    const onSelectType = vi.fn();
    const user = userEvent.setup();
    render(<ReservationTypePicker onSelectType={onSelectType} />);

    await user.click(screen.getByRole("button", { name: /lodging/i }));

    expect(onSelectType).toHaveBeenCalledWith(ReservationType.Lodging);
  });
});
