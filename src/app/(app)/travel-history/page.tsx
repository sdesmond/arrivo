import { headers, cookies } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { listSupportedCurrencies } from "@/lib/currencies";
import { listTripsForUser, getUserById, listExpensesForUserInRange } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { detectDefaultDateFormat } from "@/lib/utils";
import { buildSpendingSummary, getSpendingDateRangeBounds, resolveSpendingDateRange } from "@/lib/spending";
import { TravelHistoryPageClient } from "./page-client";

interface TravelHistoryPageProps {
  searchParams: Promise<{ view?: string; range?: string }>;
}

export default async function TravelHistoryPage({ searchParams }: TravelHistoryPageProps) {
  const params = await searchParams;
  const view = params.view;
  const session = await requireUser();
  const now = await getServerNow();
  const cookieStore = await cookies();
  const initialViewMode = cookieStore.get("travel-history-view-mode")?.value === "list" ? "list" : "cards";
  const [entries, profile, currencyOptions] = await Promise.all([
    listTripsForUser(session.id!, now),
    getUserById(session.id!),
    listSupportedCurrencies(),
  ]);
  const dateFormat = profile?.dateFormat ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "");
  const currency = profile?.currency ?? "USD";

  const initialRange = resolveSpendingDateRange(params.range);
  let initialSummary;
  if (view === "spending") {
    const { startDate, endDate } = getSpendingDateRangeBounds(initialRange, now);
    const { trips, expenses } = await listExpensesForUserInRange(session.id!, startDate, endDate);
    initialSummary = buildSpendingSummary(trips, expenses, initialRange);
  }

  return (
    <TravelHistoryPageClient
      initialEntries={entries}
      nowISO={now.toISOString()}
      dateFormat={dateFormat}
      initialViewMode={initialViewMode}
      currencyOptions={currencyOptions}
      initialSummary={initialSummary}
      initialRange={initialRange}
      currency={currency}
    />
  );
}
