import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import type { CostDialogProps } from "@/components/arrivo/cost-dialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/app/(app)/trips/[tripId]/budget/actions", () => ({
  createExpense: vi.fn(),
  deleteExpense: vi.fn(),
  updateExpense: vi.fn(),
}));
vi.mock("@/components/arrivo/cost-dialog", () => ({
  CostDialog: ({ open, onSave, onRemove }: CostDialogProps) =>
    open ? (
      <div>
        <button
          onClick={() =>
            void Promise.resolve(onSave({ category: "food", amount: 20, currency: "USD", date: "2026-08-01" })).catch(
              () => undefined
            )
          }
        >
          dialog-save
        </button>
        <button onClick={() => void Promise.resolve(onRemove?.()).catch(() => undefined)}>dialog-remove</button>
      </div>
    ) : null,
}));

import { ReservationCostChip } from "./reservation-cost-chip";
import { createExpense, deleteExpense, updateExpense } from "@/app/(app)/trips/[tripId]/budget/actions";

const expense = {
  id: "expense-1",
  tripId: "trip-1",
  reservationId: "res-1",
  category: "lodging",
  amount: 499,
  currency: "USD",
  date: "2026-08-01",
} as const;

beforeEach(() => vi.resetAllMocks());

it("creates a linked expense and shows the new amount", async () => {
  vi.mocked(createExpense).mockResolvedValue({ id: "expense-2", conversionError: true } as never);
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" />);
  await user.click(screen.getByRole("button", { name: "Add cost" }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() =>
    expect(createExpense).toHaveBeenCalledWith("trip-1", expect.objectContaining({ reservationId: "res-1" }))
  );
  expect(toast.error).toHaveBeenCalledWith("Couldn't convert currency — try again.");
  expect(await screen.findByRole("button", { name: /20/ })).toBeInTheDocument();
});

it("updates and removes an existing expense and follows the expense prop", async () => {
  vi.mocked(updateExpense).mockResolvedValue({ conversionError: true } as never);
  const user = userEvent.setup();
  const { rerender } = render(<ReservationCostChip reservationId="res-1" tripId="trip-1" expense={expense} />);
  await user.click(screen.getByRole("button", { name: /499/ }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() =>
    expect(updateExpense).toHaveBeenCalledWith("expense-1", expect.objectContaining({ reservationId: "res-1" }))
  );
  expect(toast.error).toHaveBeenCalledWith("Couldn't convert currency — try again.");
  await user.click(screen.getByRole("button", { name: "dialog-remove" }));
  await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith("expense-1"));
  expect(await screen.findByRole("button", { name: "Add cost" })).toBeInTheDocument();
  rerender(<ReservationCostChip reservationId="res-1" tripId="trip-1" expense={{ ...expense, amount: 5 }} />);
  expect(await screen.findByRole("button", { name: /5/ })).toBeInTheDocument();
});

it("shows a toast when saving fails, and ignores remove with no expense", async () => {
  vi.mocked(createExpense).mockRejectedValue(new Error("Network error"));
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" />);
  await user.click(screen.getByRole("button", { name: "Add cost" }));
  await user.click(screen.getByRole("button", { name: "dialog-remove" }));
  expect(deleteExpense).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Network error"));
});

it("shows a toast when removing fails and keeps the expense", async () => {
  vi.mocked(deleteExpense).mockRejectedValue("oops");
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" expense={expense} />);
  await user.click(screen.getByRole("button", { name: /499/ }));
  await user.click(screen.getByRole("button", { name: "dialog-remove" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to save."));
  expect(screen.getByRole("button", { name: /499/ })).toBeInTheDocument();
});
