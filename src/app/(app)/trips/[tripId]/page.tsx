import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { listSupportedCurrencies } from "@/lib/currencies";
import { getTripDetail, getUserById, listTemplatesForUser } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { detectDefaultDateFormat } from "@/lib/utils";
import type { DayItinerary } from "@/data/types";
import { TripDetailClient } from "./page-client";
import { readSearchParamValue, resolveTripDetailTab } from "./trip-detail-tabs";

function findFocusedDayNumber(days: DayItinerary[], focusEventId: string | undefined): number | undefined {
  if (!focusEventId) return undefined;
  return days.find((day) => day.events.some((event) => event.id === focusEventId))?.dayNumber;
}

export default async function TripDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ focus?: string | string[]; new?: string | string[]; tab?: string | string[] }>;
}) {
  const session = await requireUser();
  const { tripId } = await params;
  const [detail, profile, now, templates, currencyOptions] = await Promise.all([
    getTripDetail(tripId, session.id!),
    getUserById(session.id!),
    getServerNow(),
    listTemplatesForUser(session.id!),
    listSupportedCurrencies(),
  ]);

  if (!detail) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;
  const dateFormat = profile?.dateFormat ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "");
  const isNew = readSearchParamValue(resolvedSearchParams.new) === "1";
  const focusedDayNumber = findFocusedDayNumber(detail.days, readSearchParamValue(resolvedSearchParams.focus));

  return (
    <TripDetailClient
      detail={detail}
      nowISO={now.toISOString()}
      dateFormat={dateFormat}
      initialExpandedDayNumber={focusedDayNumber ?? (isNew ? 1 : undefined)}
      initialActiveTab={resolveTripDetailTab(resolvedSearchParams.tab)}
      isNew={isNew}
      templates={templates}
      currencyOptions={currencyOptions}
    />
  );
}
