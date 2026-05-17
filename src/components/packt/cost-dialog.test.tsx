// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
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
    onOpenChange?: (o: boolean) => void;
  }) =>
    open ? (
      <>
        {children}
        <button data-testid="dialog-backdrop-close" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { CostDialog } from "./cost-dialog";

describe("CostDialog", () => {
  it("renders with empty input when no cost", () => {
    render(<CostDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(null);
  });

  it("does not show Remove button when no cost", () => {
    render(<CostDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("shows Remove button when cost is provided", () => {
    render(<CostDialog cost={42.5} open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("pre-fills input with existing cost", () => {
    render(<CostDialog cost={99.5} open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(99.5);
  });

  it("calls onSave with number when Save is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CostDialog open onOpenChange={vi.fn()} onSave={onSave} />);
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "25.00");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(25);
  });

  it("calls onSave(undefined) when Remove is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CostDialog cost={50} open onOpenChange={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it("calls onSave(undefined) when input is empty and Save is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CostDialog open onOpenChange={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it("Enter key in input calls handleSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CostDialog open onOpenChange={vi.fn()} onSave={onSave} />);
    await user.type(screen.getByRole("spinbutton"), "15{Enter}");
    expect(onSave).toHaveBeenCalledWith(15);
  });

  it("Cancel button calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CostDialog open onOpenChange={onOpenChange} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("onOpenChange(false) from Dialog is forwarded to prop", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CostDialog open onOpenChange={onOpenChange} onSave={vi.fn()} />);
    await user.click(screen.getByTestId("dialog-backdrop-close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("syncs draft from cost prop when dialog transitions from closed to open", () => {
    const { rerender } = render(<CostDialog open={false} cost={75} onOpenChange={vi.fn()} onSave={vi.fn()} />);
    rerender(<CostDialog open cost={75} onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("spinbutton")).toHaveValue(75);
  });

  it("shows eventName as subtitle when provided", () => {
    render(<CostDialog open eventName="Flight to Tokyo" onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Flight to Tokyo")).toBeInTheDocument();
  });
});
