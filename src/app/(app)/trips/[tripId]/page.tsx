import { requireUser } from "@/lib/auth-helpers";
import { getTripDetail } from "@/lib/queries";
import { getServerNow } from "@/lib/server-now";
import { TripDetailClient } from "./page-client";

export default async function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const user = await requireUser();
  const { tripId } = await params;
  const detail = await getTripDetail(tripId, user.id!);
  const now = await getServerNow();
  return <TripDetailClient detail={detail} nowISO={now.toISOString()} />;
}
