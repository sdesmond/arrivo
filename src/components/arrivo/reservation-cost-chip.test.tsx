import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import type { CostDialogProps } from "@/components/arrivo/cost-dialog";

const { api, refresh } = vi.hoisted(() => ({ api: vi.fn(), refresh: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  api,
}));
vi.mock("@/components/arrivo/cost-dialog", () => ({
  CostDialog: ({ open, onSave, onRemove }: CostDialogProps) =>
    open ? (
      <div>
        <button
          onClick={() =>
            void Promise.resolve(
              onSave({
                category: "food",
                amount: 20,
                currency: "USD",
                date: "2026-08-01",
                convertedAmountTrip: 18,
                conversionRateTrip: 0.9,
                convertedCurrencyTrip: "EUR",
              })
            ).catch(() => undefined)
          }
        >
          dialog-save
        </button>
        <button onClick={() => void Promise.resolve(onRemove?.()).catch(() => undefined)}>dialog-remove</button>
      </div>
    ) : null,
}));

import { ReservationCostChip } from "./reservation-cost-chip";
import { ApiClientError } from "@/lib/api/client";
import { createExpense, deleteExpense, updateExpense } from "@/lib/api/contract/expenses";

const expense = {
  id: "expense-1",
  tripId: "trip-1",
  reservationId: "res-1",
  category: "lodging",
  amount: 499,
  currency: "USD",
  date: "2026-08-01",
  note: "Deposit",
} as const;

beforeEach(() => vi.resetAllMocks());

it("creates a linked expense through the API and shows the new amount", async () => {
  api.mockResolvedValue({ id: "expense-2", conversionError: true });
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" />);
  await user.click(screen.getByRole("button", { name: "Add cost" }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  expect(api).toHaveBeenCalledWith(createExpense, {
    params: { tripId: "trip-1" },
    body: {
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      category: "food",
      amount: 20,
      currency: "USD",
      date: "2026-08-01",
      reservationId: "res-1",
    },
  });
  expect(vi.mocked(api).mock.calls[0][1].body).not.toHaveProperty("convertedAmountTrip");
  expect(refresh).toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith("Couldn't convert currency — try again.");
  expect(await screen.findByRole("button", { name: /20/ })).toBeInTheDocument();
});

it("reuses the client id when a failed create is retried with the same input", async () => {
  api.mockRejectedValueOnce(new ApiClientError(0, "timeout", "Timed out.")).mockResolvedValueOnce({ id: "expense-2" });
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" />);
  await user.click(screen.getByRole("button", { name: "Add cost" }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Timed out."));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(api).mock.calls.map((call) => call[1].body.id);
  expect(first).toBe(second);
});

it.each([408, 409, 429, 500])("keeps the client id after a %i failure", async (status) => {
  api
    .mockRejectedValueOnce(new ApiClientError(status, "failed", "Try again."))
    .mockResolvedValueOnce({ id: "expense-2" });
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" />);
  await user.click(screen.getByRole("button", { name: "Add cost" }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Try again."));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(api).mock.calls.map((call) => call[1].body.id);
  expect(first).toBe(second);
});

it("starts a new client id after a definitive 4xx failure", async () => {
  api
    .mockRejectedValueOnce(new ApiClientError(422, "validation_failed", "Check the submitted fields."))
    .mockResolvedValueOnce({ id: "expense-2" });
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" />);
  await user.click(screen.getByRole("button", { name: "Add cost" }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Check the submitted fields."));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(api).mock.calls.map((call) => call[1].body.id);
  expect(first).not.toBe(second);
});

it("updates an existing expense with the link and converted fields left out", async () => {
  api.mockResolvedValue({ conversionError: true });
  const user = userEvent.setup();
  const { rerender } = render(<ReservationCostChip reservationId="res-1" tripId="trip-1" expense={expense} />);
  await user.click(screen.getByRole("button", { name: /499/ }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(updateExpense, {
      params: { expenseId: "expense-1" },
      body: { category: "food", amount: 20, currency: "USD", date: "2026-08-01", note: null, reservationId: "res-1" },
    })
  );
  expect(refresh).toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith("Couldn't convert currency — try again.");
  rerender(<ReservationCostChip reservationId="res-1" tripId="trip-1" expense={{ ...expense, amount: 5 }} />);
  expect(await screen.findByRole("button", { name: /5/ })).toBeInTheDocument();
});

it("removes an existing expense through the API", async () => {
  api.mockResolvedValue(null);
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" expense={expense} />);
  await user.click(screen.getByRole("button", { name: /499/ }));
  await user.click(screen.getByRole("button", { name: "dialog-remove" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(deleteExpense, { params: { expenseId: "expense-1" }, body: {} })
  );
  expect(refresh).toHaveBeenCalled();
  expect(await screen.findByRole("button", { name: "Add cost" })).toBeInTheDocument();
});

it("shows a toast when saving fails, and ignores remove with no expense", async () => {
  api.mockRejectedValue(new ApiClientError(500, "internal", "Network error"));
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" />);
  await user.click(screen.getByRole("button", { name: "Add cost" }));
  await user.click(screen.getByRole("button", { name: "dialog-remove" }));
  expect(api).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Network error"));
  expect(screen.getByRole("button", { name: "dialog-save" })).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it("shows a generic toast when saving fails with a non-Error", async () => {
  api.mockRejectedValue("oops");
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" />);
  await user.click(screen.getByRole("button", { name: "Add cost" }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to save."));
});

it("shows a toast when removing fails and keeps the expense", async () => {
  api.mockRejectedValue("oops");
  const user = userEvent.setup();
  render(<ReservationCostChip reservationId="res-1" tripId="trip-1" expense={expense} />);
  await user.click(screen.getByRole("button", { name: /499/ }));
  await user.click(screen.getByRole("button", { name: "dialog-remove" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to save."));
  expect(screen.getByRole("button", { name: /499/ })).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});
