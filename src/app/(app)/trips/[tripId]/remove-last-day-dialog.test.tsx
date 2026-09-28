import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RemoveLastDayDialog } from "./remove-last-day-dialog";

describe("RemoveLastDayDialog", () => {
  it("renders nothing while closed", () => {
    render(<RemoveLastDayDialog open={false} removingDay={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByText(/planned content will be deleted/i)).not.toBeInTheDocument();
  });

  it("confirms the removal", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<RemoveLastDayDialog open removingDay={false} onCancel={vi.fn()} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Remove Day" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancels the removal", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<RemoveLastDayDialog open removingDay={false} onCancel={onCancel} onConfirm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows the pending state and blocks both actions while removing", () => {
    render(<RemoveLastDayDialog open removingDay onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Removing Day..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });
});
