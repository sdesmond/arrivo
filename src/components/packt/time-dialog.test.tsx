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

import { TimeDialog } from "./time-dialog";

describe("TimeDialog", () => {
  it("renders Start time and End time labels", () => {
    render(<TimeDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Start time")).toBeInTheDocument();
    expect(screen.getByText("End time")).toBeInTheDocument();
  });

  it("pre-fills start time input from time prop", () => {
    render(<TimeDialog open time="10:30" onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("10:30")).toBeInTheDocument();
  });

  it("pre-fills end time input from endTime prop", () => {
    render(<TimeDialog open time="10:00" endTime="11:45" onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("11:45")).toBeInTheDocument();
  });

  it("does not show Remove button when no time is set", () => {
    render(<TimeDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("shows Remove button when time prop is provided", () => {
    render(<TimeDialog open time="10:00" onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("Remove button calls onSave(undefined, undefined) and closes", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onOpenChange = vi.fn();
    render(<TimeDialog open time="10:00" endTime="11:00" onOpenChange={onOpenChange} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onSave).toHaveBeenCalledWith(undefined, undefined);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Save button calls onSave with pre-filled values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TimeDialog open time="09:00" endTime="10:00" onOpenChange={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith("09:00", "10:00");
  });

  it("Save button calls onSave with undefined when inputs are empty", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<TimeDialog open onOpenChange={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(undefined, undefined);
  });

  it("Cancel button calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TimeDialog open onOpenChange={onOpenChange} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows eventName as subtitle when provided", () => {
    render(<TimeDialog open eventName="Dinner at Nobu" onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText("Dinner at Nobu")).toBeInTheDocument();
  });

  it("does not render eventName element when omitted", () => {
    render(<TimeDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByText("Dinner at Nobu")).not.toBeInTheDocument();
  });

  it("syncs draft from time prop when dialog transitions from closed to open", () => {
    const { rerender } = render(<TimeDialog open={false} time="08:00" onOpenChange={vi.fn()} onSave={vi.fn()} />);
    rerender(<TimeDialog open time="08:00" onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByDisplayValue("08:00")).toBeInTheDocument();
  });
});
