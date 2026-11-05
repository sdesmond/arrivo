import "server-only";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { getDayRouteSummary } from "@/lib/route";
import {
  assertEventsBelongToTrip,
  badRouteRequest,
  parseDayRouteBody,
  readJsonObject,
  routeJson,
} from "@/lib/route-request";

// A read-only lookup, so it is a route handler rather than a server action: server actions share the
// router's one-at-a-time queue, and a slow lookup there can overwrite the URL after a navigation.
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const user = await requireUser();
  const { tripId } = await params;
  await assertTripAccess(tripId, user.id!, "viewer");

  const body = await readJsonObject(request);
  const parsed = body && parseDayRouteBody(body);
  if (!parsed) return badRouteRequest();

  await assertEventsBelongToTrip(tripId, parsed.events);
  return routeJson(await getDayRouteSummary(parsed.events, parsed.transitMode, parsed.walkThresholdMeters));
}
