// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
      <div
        role="dialog"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") onOpenChange?.(false);
        }}
      >
        {children}
      </div>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/date-range-picker", () => ({
  DateRangePicker: ({
    start,
    end,
    onChange,
  }: {
    start?: string;
    end?: string;
    onChange: (start: string | undefined, end: string | undefined) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange("2026-06-01", "2026-06-10")}>
        Optional date range
      </button>
      <span data-testid="date-value">
        {start ?? "none"}-{end ?? "none"}
      </span>
    </div>
  ),
}));

import { NewTripDialog } from "./new-trip-dialog";

describe("NewTripDialog", () => {
  it("focuses the title field when opened", async () => {
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    const title = screen.getByLabelText(/title/i);
    await waitFor(() => expect(title).toHaveFocus());
  });

  it("renders title, date range, and budget fields", () => {
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /optional date range/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/budget/i)).toBeInTheDocument();
  });

  it("keeps Create disabled until the title has non-whitespace content", async () => {
    const user = userEvent.setup();
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    const create = screen.getByRole("button", { name: /create/i });
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText(/title/i), "   ");
    expect(create).toBeDisabled();
    await user.type(screen.getByLabelText(/title/i), "A");
    expect(create).toBeEnabled();
  });

  it("disables Create button when isPending=true", async () => {
    const user = userEvent.setup();
    render(<NewTripDialog open onOpenChange={vi.fn()} isPending />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    expect(screen.getByRole("button", { name: /creating/i })).toBeDisabled();
  });

  it("shows Creating text on Create button when isPending=true", async () => {
    const user = userEvent.setup();
    render(<NewTripDialog open onOpenChange={vi.fn()} isPending />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    expect(screen.getByRole("button", { name: /creating/i })).toBeInTheDocument();
  });

  it("shows inline validation when form is submitted with a whitespace-only title", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "   ");
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(screen.getByRole("status")).toHaveTextContent("Enter a trip title.");
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("filters budget input to numeric currency characters", async () => {
    const user = userEvent.setup();
    render(<NewTripDialog open onOpenChange={vi.fn()} />);
    const budget = screen.getByLabelText(/budget/i);
    await user.type(budget, "a12.345x");
    expect(budget).toHaveValue("12.34");
  });

  it("coerces lone decimal point budget to undefined on submit", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    await user.type(screen.getByLabelText(/budget/i), ".");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ budgetAmount: undefined }));
  });

  it("coerces trailing decimal point budget to integer on submit", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    await user.type(screen.getByLabelText(/budget/i), "100.");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ budgetAmount: "100" }));
  });

  it("submits a trimmed draft through onCreate", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "  Paris  ");
    await user.click(screen.getByRole("button", { name: /optional date range/i }));
    await user.type(screen.getByLabelText(/budget/i), "1500");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith({
      title: "Paris",
      startDate: "2026-06-01",
      endDate: "2026-06-10",
      budgetAmount: "1500",
    });
  });

  it("renders nothing when closed (open=false)", () => {
    render(<NewTripDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes without submitting when onCreate is not provided", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<NewTripDialog open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes without submit on Cancel", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={onOpenChange} onCreate={onCreate} />);
    await user.type(screen.getByLabelText(/title/i), "Paris");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("closes without submit on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCreate = vi.fn();
    render(<NewTripDialog open onOpenChange={onOpenChange} onCreate={onCreate} />);
    screen.getByRole("dialog").focus();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
