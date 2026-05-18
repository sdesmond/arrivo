import { headers } from "next/headers";
import { requireUser } from "@/lib/auth-helpers";
import { getTripDetail, getUserById } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { detectDefaultDateFormat } from "@/lib/utils";
import { TripDetailClient } from "./page-client";

export default async function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const session = await requireUser();
  const { tripId } = await params;
  const [detail, profile, now] = await Promise.all([
    getTripDetail(tripId, session.id!),
    getUserById(session.id!),
    getServerNow(),
  ]);
  const dateFormat = profile?.dateFormat ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "");
  return <TripDetailClient detail={detail} nowISO={now.toISOString()} dateFormat={dateFormat} />;
}
