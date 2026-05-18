import { headers } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { listTripsForUser, getUserById } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { detectDefaultDateFormat } from "@/lib/utils";
import { TripsPageClient } from "./page-client";

export default async function TripsPage() {
  const session = await requireUser();
  const now = await getServerNow();
  const [entries, profile] = await Promise.all([listTripsForUser(session.id!, now), getUserById(session.id!)]);
  const dateFormat = profile?.dateFormat ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "");
  return <TripsPageClient initialEntries={entries} nowISO={now.toISOString()} dateFormat={dateFormat} />;
}
