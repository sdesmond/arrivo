import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({
    children,
    title,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    title?: string;
    "aria-label"?: string;
  }) => (
    <button title={title} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: React.MouseEventHandler }) => (
    <button onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

import { PackingListToolbar } from "./packing-list-toolbar";

describe("PackingListToolbar", () => {
  it("renders packed progress count when itemCount > 0", () => {
    render(<PackingListToolbar itemCount={5} packedCount={2} onOpenNewSection={vi.fn()} />);
    expect(screen.getByText("2 of 5 packed")).toBeInTheDocument();
  });

  it("hides packed progress count when itemCount is 0", () => {
    render(<PackingListToolbar itemCount={0} packedCount={0} onOpenNewSection={vi.fn()} />);
    expect(screen.queryByText(/packed/)).not.toBeInTheDocument();
  });

  it("renders overflow trigger button when any action prop is provided", () => {
    render(<PackingListToolbar itemCount={0} packedCount={0} onOpenNewSection={vi.fn()} />);
    expect(screen.getByRole("button", { name: "List options" })).toBeInTheDocument();
  });

  it("does not render overflow trigger when no action props are provided", () => {
    render(<PackingListToolbar itemCount={5} packedCount={1} />);
    expect(screen.queryByRole("button", { name: "List options" })).not.toBeInTheDocument();
  });

  it("renders Pull templates menu item when onOpenPullDialog is provided", () => {
    render(<PackingListToolbar itemCount={0} packedCount={0} onOpenPullDialog={vi.fn()} onOpenNewSection={vi.fn()} />);
    expect(screen.getByText("Pull templates")).toBeInTheDocument();
  });

  it("does not render Pull templates menu item when onOpenPullDialog is not provided", () => {
    render(<PackingListToolbar itemCount={5} packedCount={1} onOpenNewSection={vi.fn()} />);
    expect(screen.queryByText("Pull templates")).not.toBeInTheDocument();
  });

  it("renders New section menu item when onOpenNewSection is provided", () => {
    render(<PackingListToolbar itemCount={0} packedCount={0} onOpenNewSection={vi.fn()} />);
    expect(screen.getByText("New section")).toBeInTheDocument();
  });

  it("renders Save as template menu item when onOpenSaveDialog is provided and itemCount > 0", () => {
    render(<PackingListToolbar itemCount={3} packedCount={1} onOpenSaveDialog={vi.fn()} onOpenNewSection={vi.fn()} />);
    expect(screen.getByText("Save as template")).toBeInTheDocument();
  });

  it("does not render Save as template when onOpenSaveDialog is provided but itemCount is 0", () => {
    render(<PackingListToolbar itemCount={0} packedCount={0} onOpenSaveDialog={vi.fn()} onOpenNewSection={vi.fn()} />);
    expect(screen.queryByText("Save as template")).not.toBeInTheDocument();
  });

  it("calls onOpenPullDialog when Pull templates is clicked", async () => {
    const user = userEvent.setup();
    const onOpenPullDialog = vi.fn();
    render(
      <PackingListToolbar
        itemCount={5}
        packedCount={1}
        onOpenPullDialog={onOpenPullDialog}
        onOpenNewSection={vi.fn()}
      />
    );
    await user.click(screen.getByText("Pull templates"));
    expect(onOpenPullDialog).toHaveBeenCalledOnce();
  });

  it("calls onOpenSaveDialog when Save as template is clicked", async () => {
    const user = userEvent.setup();
    const onOpenSaveDialog = vi.fn();
    render(
      <PackingListToolbar
        itemCount={5}
        packedCount={1}
        onOpenSaveDialog={onOpenSaveDialog}
        onOpenNewSection={vi.fn()}
      />
    );
    await user.click(screen.getByText("Save as template"));
    expect(onOpenSaveDialog).toHaveBeenCalledOnce();
  });

  it("calls onOpenNewSection when New section is clicked", async () => {
    const user = userEvent.setup();
    const onOpenNewSection = vi.fn();
    render(<PackingListToolbar itemCount={0} packedCount={0} onOpenNewSection={onOpenNewSection} />);
    await user.click(screen.getByText("New section"));
    expect(onOpenNewSection).toHaveBeenCalledOnce();
  });
});
