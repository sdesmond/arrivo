import { expect, it } from "vitest";
import { createExpense, listExpenses } from "./expenses";

const id = "123e4567-e89b-12d3-a456-426614174000";
const base = { id, category: "food", amount: 12.5, currency: "EUR", date: "2026-08-01" };

it("defines trip expense endpoints and normalizes IDs", () => {
  expect(listExpenses.path).toBe("/api/v1/trips/:tripId/expenses");
  expect(listExpenses.method).toBe("GET");
  expect(createExpense.method).toBe("POST");
  expect(createExpense.params.parse({ tripId: id.toUpperCase() })).toEqual({ tripId: id });
  expect(createExpense.body.parse({ ...base, id: id.toUpperCase(), eventId: id.toUpperCase() })).toMatchObject({
    id,
    eventId: id,
  });
});

it("accepts valid bodies including whole-cent float amounts and one link", () => {
  for (const body of [base, { ...base, amount: 0.07 }, { ...base, amount: 50000 }, { ...base, note: null }])
    expect(createExpense.body.safeParse(body).success).toBe(true);
  expect(createExpense.body.safeParse({ ...base, reservationId: id }).success).toBe(true);
});

it("rejects invalid fields", () => {
  const withoutId = { ...base, id: undefined };
  for (const body of [
    withoutId,
    { ...base, id: "nope" },
    { ...base, category: "teleport" },
    { ...base, category: undefined },
    { ...base, amount: 0 },
    { ...base, amount: -1 },
    { ...base, amount: 50000.01 },
    { ...base, amount: 1.234 },
    { ...base, amount: 1e-9 },
    { ...base, amount: 0.001 },
    { ...base, currency: "ZZZ" },
    { ...base, amount: "12" },
    { ...base, currency: "  " },
    { ...base, date: "2026-02-30" },
    { ...base, date: undefined },
    { ...base, note: "x".repeat(501) },
    { ...base, extra: true },
    { ...base, eventId: id, reservationId: id },
  ])
    expect(createExpense.body.safeParse(body).success).toBe(false);
});

it("explains the shared validation failures", () => {
  const messages = (body: unknown) =>
    createExpense.body.safeParse(body).error?.issues.map((issue) => issue.message) ?? [];
  expect(messages({ ...base, category: "x" })).toContain("Expense category is required.");
  expect(messages({ ...base, amount: 0 })).toContain("Amount must be greater than 0.");
  expect(messages({ ...base, amount: 1e-9 })).toContain("Amount must be at least 0.01.");
  expect(messages({ ...base, currency: "ZZZ" })).toContain("Unsupported currency.");
  expect(messages({ ...base, amount: 60000 })).toContain("Amount must be 50,000 or less.");
  expect(messages({ ...base, amount: 1.001 })).toContain("Amount must have at most 2 decimal places.");
  expect(messages({ ...base, date: "bad" })).toContain("Date is required.");
  expect(messages({ ...base, note: "x".repeat(501) })).toContain("Note must be 500 characters or fewer.");
  expect(messages({ ...base, eventId: id, reservationId: id })).toContain(
    "Expense cannot be linked to both an event and a reservation."
  );
});
