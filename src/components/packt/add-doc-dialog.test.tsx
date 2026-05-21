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

import { AddDocDialog } from "./add-doc-dialog";

describe("AddDocDialog", () => {
  it("renders name input and type buttons", () => {
    render(<AddDocDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /image/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /doc/i })).toBeInTheDocument();
  });

  it("does not render a Link type button", () => {
    render(<AddDocDialog open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /link/i })).not.toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Attach is clicked with a valid name", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Name"), "My Document");
    await user.click(screen.getByRole("button", { name: /attach/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Attach button is disabled when name is empty", () => {
    render(<AddDocDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /attach/i })).toBeDisabled();
  });

  it("Enter key in name input closes dialog when name is filled", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Name"), "Board Pass{Enter}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Enter key in name input does nothing when name is empty", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open onOpenChange={onOpenChange} />);
    screen.getByLabelText("Name").focus();
    await user.keyboard("{Enter}");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("Cancel button calls onOpenChange(false) and resets state", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText("Name"), "Draft");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("onOpenChange(false) from Dialog triggers handleClose", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open onOpenChange={onOpenChange} />);
    await user.click(screen.getByTestId("dialog-backdrop-close"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows eventName as subtitle when provided", () => {
    render(<AddDocDialog open eventName="Museum visit" onOpenChange={vi.fn()} />);
    expect(screen.getByText("Museum visit")).toBeInTheDocument();
  });
});
