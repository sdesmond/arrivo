import "server-only";
import type { NextRequest } from "next/server";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { createLiveSyncResponse, subscribeTripForUser } from "@/lib/trip-events";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const user = await requireUser();
  const { tripId } = await params;
  await assertTripAccess(tripId, user.id!, "viewer");

  return createLiveSyncResponse(request.signal, (callback) => subscribeTripForUser(tripId, user.id!, callback));
}
