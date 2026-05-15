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

import { LocationDialog } from "./location-dialog";

describe("LocationDialog", () => {
  it("renders with empty input when no address", () => {
    render(<LocationDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("does not show Remove button when no address", () => {
    render(<LocationDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("shows Remove button when address is provided", () => {
    render(<LocationDialog address="Paris" open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });

  it("prefills input with existing address", () => {
    render(<LocationDialog address="Paris" open onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("Paris");
  });

  it("calls onSave with typed address when Save is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<LocationDialog open onOpenChange={vi.fn()} onSave={onSave} />);
    await user.type(screen.getByRole("textbox"), "Tokyo");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith("Tokyo");
  });

  it("calls onSave(undefined) when Remove is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<LocationDialog address="Paris" open onOpenChange={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it("calls onSave(undefined) when input is empty and Save is clicked", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<LocationDialog open onOpenChange={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it("Enter key in input calls handleSave", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<LocationDialog open onOpenChange={vi.fn()} onSave={onSave} />);
    await user.type(screen.getByRole("textbox"), "London{Enter}");
    expect(onSave).toHaveBeenCalledWith("London");
  });

  it("Cancel button calls onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<LocationDialog open onOpenChange={onOpenChange} onSave={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("onOpenChange(false) from Dialog is forwarded to prop", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<LocationDialog open onOpenChange={onOpenChange} onSave={vi.fn()} />);
    await user.click(screen.getByTestId("dialog-backdrop-close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("syncs draft from address prop when dialog transitions from closed to open", async () => {
    const { rerender } = render(
      <LocationDialog open={false} address="Paris" onOpenChange={vi.fn()} onSave={vi.fn()} />
    );
    rerender(<LocationDialog open address="Paris" onOpenChange={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("Paris");
  });
});
