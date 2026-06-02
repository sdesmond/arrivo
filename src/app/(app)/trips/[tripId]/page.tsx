import { headers } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { getTripDetail, getUserById, listTemplatesForUser } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { detectDefaultDateFormat } from "@/lib/utils";
import { TripDetailClient } from "./page-client";

export default async function TripDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await requireUser();
  const { tripId } = await params;
  const [detail, profile, now, templates] = await Promise.all([
    getTripDetail(tripId, session.id!),
    getUserById(session.id!),
    getServerNow(),
    listTemplatesForUser(session.id!),
  ]);
  const resolvedSearchParams = await searchParams;
  const dateFormat = profile?.dateFormat ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "");
  return (
    <TripDetailClient
      detail={detail}
      nowISO={now.toISOString()}
      dateFormat={dateFormat}
      initialExpandedDayNumber={resolvedSearchParams.new === "1" ? 1 : undefined}
      isNew={resolvedSearchParams.new === "1"}
      templates={templates}
    />
  );
}
