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
    expect(screen.getByRole("button", { name: /link/i })).toBeInTheDocument();
  });

  it("does not show URL field by default (PDF is selected)", () => {
    render(<AddDocDialog open onOpenChange={vi.fn()} />);
    expect(screen.queryByLabelText("URL")).not.toBeInTheDocument();
  });

  it("shows URL field when Link type is selected", async () => {
    const user = userEvent.setup();
    render(<AddDocDialog open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /link/i }));
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
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

  it("Enter key in URL input closes dialog when name is filled", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<AddDocDialog open onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole("button", { name: /link/i }));
    await user.type(screen.getByLabelText("Name"), "My Link");
    await user.type(screen.getByLabelText("URL"), "https://example.com{Enter}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
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
