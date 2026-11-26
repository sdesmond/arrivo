import { expect, it, vi } from "vitest";
const { recalculate, apiRoute } = vi.hoisted(() => ({
  recalculate: vi.fn(),
  apiRoute: vi.fn((...args: [unknown, (input: unknown) => unknown, unknown?]) => args[1]),
}));
vi.mock("@/lib/services/expense-conversions", () => ({ recalculateExpenseConversions: recalculate }));
vi.mock("@/lib/api/route", () => ({ apiRoute }));
import { POST } from "./route";
import { recalculateExpenses } from "@/lib/api/contract/expenses";

it("registers an idempotent POST and forwards its inputs", async () => {
  expect(apiRoute.mock.calls[0][0]).toBe(recalculateExpenses);
  expect(apiRoute.mock.calls[0][2]).toEqual({ idempotent: {} });
  const input = { actor: { userId: "user" }, params: { tripId: "trip" }, body: {}, replay: { key: "retry" } };
  await (POST as unknown as (input: unknown) => Promise<unknown>)(input);
  expect(recalculate).toHaveBeenCalledWith(input.actor, "trip", input.body, input.replay);
});
