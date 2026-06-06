import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackingListToolbar } from "./packing-list-toolbar";

describe("PackingListToolbar", () => {
  it("renders packed progress count", () => {
    render(<PackingListToolbar itemCount={5} packedCount={2} />);
    expect(screen.getByText("2 of 5 packed")).toBeInTheDocument();
  });

  it("renders 0 of N packed when nothing is packed", () => {
    render(<PackingListToolbar itemCount={4} packedCount={0} />);
    expect(screen.getByText("0 of 4 packed")).toBeInTheDocument();
  });

  it("renders N of N packed when everything is packed", () => {
    render(<PackingListToolbar itemCount={3} packedCount={3} />);
    expect(screen.getByText("3 of 3 packed")).toBeInTheDocument();
  });

  it("does not render pull templates button when onOpenPullDialog is not provided", () => {
    render(<PackingListToolbar itemCount={5} packedCount={1} />);
    expect(screen.queryByRole("button", { name: /pull templates/i })).not.toBeInTheDocument();
  });

  it("does not render save as template button when onOpenSaveDialog is not provided", () => {
    render(<PackingListToolbar itemCount={5} packedCount={1} />);
    expect(screen.queryByRole("button", { name: /save as template/i })).not.toBeInTheDocument();
  });

  it("calls onOpenPullDialog when pull templates button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenPullDialog = vi.fn();
    render(<PackingListToolbar itemCount={5} packedCount={1} onOpenPullDialog={onOpenPullDialog} />);
    await user.click(screen.getByRole("button", { name: /pull templates/i }));
    expect(onOpenPullDialog).toHaveBeenCalledOnce();
  });

  it("calls onOpenSaveDialog when save as template button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenSaveDialog = vi.fn();
    render(<PackingListToolbar itemCount={5} packedCount={1} onOpenSaveDialog={onOpenSaveDialog} />);
    await user.click(screen.getByRole("button", { name: /save as template/i }));
    expect(onOpenSaveDialog).toHaveBeenCalledOnce();
  });
});
