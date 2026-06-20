import { headers, cookies } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { listTripsForUser, getUserById } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { detectDefaultDateFormat } from "@/lib/utils";
import { TravelHistoryPageClient } from "./page-client";

export default async function TravelHistoryPage() {
  const session = await requireUser();
  const now = await getServerNow();
  const cookieStore = await cookies();
  const initialViewMode = cookieStore.get("travel-history-view-mode")?.value === "list" ? "list" : "cards";
  const [entries, profile] = await Promise.all([listTripsForUser(session.id!, now), getUserById(session.id!)]);
  const dateFormat = profile?.dateFormat ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "");
  return (
    <TravelHistoryPageClient
      initialEntries={entries}
      nowISO={now.toISOString()}
      dateFormat={dateFormat}
      initialViewMode={initialViewMode}
    />
  );
}
