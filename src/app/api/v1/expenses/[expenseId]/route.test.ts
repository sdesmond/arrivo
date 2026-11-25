import { expect, it, vi } from "vitest";
const { update, remove, apiRoute } = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/expenses", () => ({ updateExpense: update, deleteExpense: remove }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { DELETE, PATCH } from "./route";
import { deleteExpense, updateExpense } from "@/lib/api/contract/expenses";

it("registers idempotent PATCH and DELETE and forwards their inputs", async () => {
  expect(apiRoute.mock.calls[0][0]).toBe(updateExpense);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
  expect(apiRoute.mock.calls[1][0]).toBe(deleteExpense);
  const input = {
    actor: { userId: "user" },
    params: { expenseId: "expense" },
    body: { note: null },
    replay: { key: "retry" },
  };
  await (PATCH as unknown as (input: unknown) => Promise<unknown>)(input);
  await (DELETE as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(update).toHaveBeenCalledWith(input.actor, "expense", input.body, input.replay);
  expect(remove).toHaveBeenCalledWith(input.actor, "expense", input.body);
});
