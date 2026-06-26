import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import { CostDialog } from "./cost-dialog";

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
        <button data-testid="dialog-backdrop-close" onClick={() => onOpenChange?.(false)} />
      </>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-footer">{children}</div>,
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO="2026-08-02T12:00:00.000Z">{children}</MockDateProvider>;
}

describe("CostDialog", () => {
  it("renders nothing when closed", () => {
    render(<CostDialog open={false} onOpenChange={vi.fn()} onSave={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("renders amount, currency, category, date, and note fields", () => {
    render(<CostDialog open defaultCurrency="EUR" onOpenChange={vi.fn()} onSave={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Currency: Euro EUR/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select category/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /august 2, 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
  });

  it("defaults currency from props and date from mocked now", () => {
    render(<CostDialog open defaultCurrency="EUR" onOpenChange={vi.fn()} onSave={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.getByRole("button", { name: /Currency: Euro EUR/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /august 2, 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Amount" }).parentElement).toHaveClass("rounded-lg", "h-9");
  });

  it("shows inline validation when category is missing on save", async () => {
    const user = userEvent.setup();
    render(<CostDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />, { wrapper: Wrapper });

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Category is required.")).toBeInTheDocument());
  });

  it("submits a structured expense payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<CostDialog open defaultCurrency="USD" onOpenChange={vi.fn()} onSave={onSave} />, { wrapper: Wrapper });

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "25");
    await user.click(screen.getByRole("button", { name: /select category/i }));
    await user.click(screen.getByRole("option", { name: "Food" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), "Lunch");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        category: "food",
        amount: 25,
        currency: "USD",
        date: "2026-08-02",
        note: "Lunch",
      })
    );
  });

  it("uses the same searchable currency picker as trip budget", async () => {
    const user = userEvent.setup();
    render(<CostDialog open defaultCurrency="USD" onOpenChange={vi.fn()} onSave={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /Currency: United States Dollar USD/i }));

    expect(screen.getByRole("textbox", { name: "Search currencies" })).toBeInTheDocument();
  });

  it("blocks entry past two fraction digits in amount field", async () => {
    const user = userEvent.setup();
    render(<CostDialog open defaultCurrency="USD" onOpenChange={vi.fn()} onSave={vi.fn()} />, { wrapper: Wrapper });

    const amountInput = screen.getByRole("textbox", { name: "Amount" });

    await user.type(amountInput, "12.345");

    expect(amountInput).toHaveValue("12.34");
  });

  it("renders existing expense values and optional event name", () => {
    render(
      <CostDialog
        open
        eventName="Dinner in Rome"
        expense={{
          id: "expense-1",
          tripId: "trip-1",
          category: "food",
          amount: 25,
          currency: "EUR",
          date: "2026-08-01",
          note: "Patio table",
        }}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    expect(screen.getByText("Dinner in Rome")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("25");
    expect(screen.getByRole("button", { name: /Currency: Euro EUR/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Food" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Patio table");
  });

  it("clears validation after typing amount and picking a category", async () => {
    const user = userEvent.setup();
    render(<CostDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.getByText("Amount is required.")).toBeInTheDocument();
      expect(screen.getByText("Category is required.")).toBeInTheDocument();
    });

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "14");
    await user.click(screen.getByRole("button", { name: /select category/i }));
    await user.click(screen.getByRole("option", { name: "Food" }));

    expect(screen.queryByText("Amount is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Category is required.")).not.toBeInTheDocument();
  });

  it("shows remove button only for an existing expense", () => {
    const { rerender } = render(<CostDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();

    rerender(
      <MockDateProvider initialISO="2026-08-02T12:00:00.000Z">
        <CostDialog
          open
          expense={{
            id: "expense-1",
            tripId: "trip-1",
            category: "food",
            amount: 25,
            currency: "USD",
            date: "2026-08-01",
          }}
          onOpenChange={vi.fn()}
          onSave={vi.fn()}
          onRemove={vi.fn()}
        />
      </MockDateProvider>
    );

    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("calls onRemove when remove is clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(
      <CostDialog
        open
        expense={{
          id: "expense-1",
          tripId: "trip-1",
          category: "food",
          amount: 25,
          currency: "USD",
          date: "2026-08-01",
        }}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        onRemove={onRemove}
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("submits from Enter in amount field and stays open when save fails", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<CostDialog open onOpenChange={onOpenChange} onSave={onSave} />, { wrapper: Wrapper });

    await user.type(screen.getByRole("textbox", { name: "Amount" }), "25");
    await user.click(screen.getByRole("button", { name: /select category/i }));
    await user.click(screen.getByRole("option", { name: "Food" }));
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "{Enter}");

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("stays open when remove fails", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onRemove = vi.fn().mockRejectedValue(new Error("Network error"));
    render(
      <CostDialog
        open
        expense={{
          id: "expense-1",
          tripId: "trip-1",
          category: "food",
          amount: 25,
          currency: "USD",
          date: "2026-08-01",
        }}
        onOpenChange={onOpenChange}
        onSave={vi.fn()}
        onRemove={onRemove}
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(onRemove).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("closes on Escape from category picker and returns focus to trigger", async () => {
    const user = userEvent.setup();
    render(<CostDialog open onOpenChange={vi.fn()} onSave={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: /select category/i }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox", { name: "Expense categories" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /select category/i })).toHaveFocus());
  });

  it("forwards cancel and backdrop close to onOpenChange(false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<CostDialog open onOpenChange={onOpenChange} onSave={vi.fn()} />, { wrapper: Wrapper });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByTestId("dialog-backdrop-close"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("places remove on left and cancel-save group on right", () => {
    render(
      <CostDialog
        open
        expense={{
          id: "expense-1",
          tripId: "trip-1",
          category: "food",
          amount: 25,
          currency: "USD",
          date: "2026-08-01",
        }}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        onRemove={vi.fn()}
      />,
      { wrapper: Wrapper }
    );

    const footer = screen.getByTestId("dialog-footer");
    const [removeButton, actionGroup] = Array.from(footer.children);
    const [cancelButton, saveButton] = Array.from(actionGroup.children);

    expect(removeButton).toHaveTextContent("Remove");
    expect(cancelButton).toHaveTextContent("Cancel");
    expect(saveButton).toHaveTextContent("Save");
  });
});
