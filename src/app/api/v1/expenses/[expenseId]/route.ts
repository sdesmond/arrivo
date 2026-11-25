import { apiRoute } from "@/lib/api/route";
import { deleteExpense, updateExpense } from "@/lib/api/contract/expenses";
import { deleteExpense as remove, updateExpense as update } from "@/lib/services/expenses";

export const PATCH = apiRoute(
  updateExpense,
  ({ actor, params, body, replay }) => update(actor, params.expenseId, body, replay),
  { idempotent: {} }
);
export const DELETE = apiRoute(deleteExpense, ({ actor, params, body }) => remove(actor, params.expenseId, body));
