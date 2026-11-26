import { apiRoute } from "@/lib/api/route";
import { recalculateExpenses } from "@/lib/api/contract/expenses";
import { recalculateExpenseConversions } from "@/lib/services/expense-conversions";

export const POST = apiRoute(
  recalculateExpenses,
  ({ actor, params, body, replay }) => recalculateExpenseConversions(actor, params.tripId, body, replay),
  { idempotent: {} }
);
