import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { getTripDetail, getUserById, listTemplatesForUser } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { detectDefaultDateFormat } from "@/lib/utils";
import { TripDetailClient } from "./page-client";
import { readSearchParamValue, resolveTripDetailTab } from "./trip-detail-tabs";

export default async function TripDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ new?: string | string[]; tab?: string | string[] }>;
}) {
  const session = await requireUser();
  const { tripId } = await params;
  const [detail, profile, now, templates] = await Promise.all([
    getTripDetail(tripId, session.id!),
    getUserById(session.id!),
    getServerNow(),
    listTemplatesForUser(session.id!),
  ]);

  if (!detail) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const dateFormat = profile?.dateFormat ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "");
  const isNew = readSearchParamValue(resolvedSearchParams.new) === "1";

  return (
    <TripDetailClient
      detail={detail}
      nowISO={now.toISOString()}
      dateFormat={dateFormat}
      initialExpandedDayNumber={isNew ? 1 : undefined}
      initialActiveTab={resolveTripDetailTab(resolvedSearchParams.tab)}
      isNew={isNew}
      templates={templates}
    />
  );
}
