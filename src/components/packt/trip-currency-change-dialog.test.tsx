import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-dismiss" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
}));

import { TripCurrencyChangeDialog } from "./trip-currency-change-dialog";

describe("TripCurrencyChangeDialog", () => {
  it("renders nothing when isOpen is false", () => {
    render(<TripCurrencyChangeDialog isOpen={false} onCancel={vi.fn()} onLeaveAsIs={vi.fn()} onConvert={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Convert" })).not.toBeInTheDocument();
  });

  it("renders the dialog copy and all three actions", () => {
    render(<TripCurrencyChangeDialog isOpen onCancel={vi.fn()} onLeaveAsIs={vi.fn()} onConvert={vi.fn()} />);

    expect(
      screen.getByText(
        "Some of your expenses don't match your new currency selection. Do you want to convert them to this new currency?"
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave As Is" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Convert" })).toBeInTheDocument();
  });

  it("focuses Cancel (first in tab order) when opened", () => {
    render(<TripCurrencyChangeDialog isOpen onCancel={vi.fn()} onLeaveAsIs={vi.fn()} onConvert={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<TripCurrencyChangeDialog isOpen onCancel={onCancel} onLeaveAsIs={vi.fn()} onConvert={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onLeaveAsIs when Leave As Is is clicked", async () => {
    const user = userEvent.setup();
    const onLeaveAsIs = vi.fn();
    render(<TripCurrencyChangeDialog isOpen onCancel={vi.fn()} onLeaveAsIs={onLeaveAsIs} onConvert={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Leave As Is" }));

    expect(onLeaveAsIs).toHaveBeenCalledOnce();
  });

  it("calls onConvert when Convert is clicked", async () => {
    const user = userEvent.setup();
    const onConvert = vi.fn();
    render(<TripCurrencyChangeDialog isOpen onCancel={vi.fn()} onLeaveAsIs={vi.fn()} onConvert={onConvert} />);

    await user.click(screen.getByRole("button", { name: "Convert" }));

    expect(onConvert).toHaveBeenCalledOnce();
  });

  it("calls onCancel when dismissed via Esc/outside click", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<TripCurrencyChangeDialog isOpen onCancel={onCancel} onLeaveAsIs={vi.fn()} onConvert={vi.fn()} />);

    await user.click(screen.getByTestId("dialog-dismiss"));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("places Cancel alone on the left and Leave As Is + Convert grouped on the right", () => {
    render(<TripCurrencyChangeDialog isOpen onCancel={vi.fn()} onLeaveAsIs={vi.fn()} onConvert={vi.fn()} />);

    const footer = screen.getByTestId("dialog-footer");
    const [cancelButton, actionGroup] = Array.from(footer.children);
    const [leaveAsIsButton, convertButton] = Array.from(actionGroup.children);

    expect(cancelButton).toHaveTextContent("Cancel");
    expect(leaveAsIsButton).toHaveTextContent("Leave As Is");
    expect(convertButton).toHaveTextContent("Convert");
  });

  it("disables all actions while saving", () => {
    render(<TripCurrencyChangeDialog isOpen saving onCancel={vi.fn()} onLeaveAsIs={vi.fn()} onConvert={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Leave As Is" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Convert" })).toBeDisabled();
  });
});
