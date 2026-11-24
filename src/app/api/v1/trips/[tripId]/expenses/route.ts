import { apiRoute } from "@/lib/api/route";
import { createExpense, listExpenses } from "@/lib/api/contract/expenses";
import { createExpense as create, listExpenses as list } from "@/lib/services/expenses";

export const GET = apiRoute(listExpenses, ({ actor, params, body }) => list(actor, params.tripId, body));
export const POST = apiRoute(
  createExpense,
  ({ actor, params, body, replay }) => create(actor, params.tripId, body, replay),
  { idempotent: {} }
);
