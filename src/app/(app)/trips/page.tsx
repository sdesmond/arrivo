import { requireUser } from "@/lib/auth-helpers";
import { listTripsForUser } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { TripsPageClient } from "./page-client";

export default async function TripsPage() {
  const user = await requireUser();
  const now = await getServerNow();
  const entries = await listTripsForUser(user.id!, now);
  return <TripsPageClient initialEntries={entries} nowISO={now.toISOString()} />;
}
