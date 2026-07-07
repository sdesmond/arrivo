import { headers, cookies } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { listSupportedCurrencies } from "@/lib/currencies";
import { listTripsForUser, getUserById } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { detectDefaultDateFormat } from "@/lib/utils";
import { TripsPageClient } from "./page-client";

export default async function TripsPage() {
  const session = await requireUser();
  const now = await getServerNow();
  const cookieStore = await cookies();
  const initialViewMode = cookieStore.get("trips-view-mode")?.value === "list" ? "list" : "cards";
  const [entries, profile, currencyOptions] = await Promise.all([
    listTripsForUser(session.id!, now),
    getUserById(session.id!),
    listSupportedCurrencies(),
  ]);
  const dateFormat = profile?.dateFormat ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "");
  return (
    <TripsPageClient
      initialEntries={entries}
      nowISO={now.toISOString()}
      dateFormat={dateFormat}
      initialViewMode={initialViewMode}
      currencyOptions={currencyOptions}
    />
  );
}
