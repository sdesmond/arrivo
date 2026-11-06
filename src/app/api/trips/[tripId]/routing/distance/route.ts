import "server-only";
import { assertTripAccess, requireUser } from "@/lib/auth-helpers";
import { rateLimitedResponse } from "@/lib/rate-limit";
import { getRouteDistanceTime } from "@/lib/route";
import { badRouteRequest, parseDistanceBody, readJsonObject, routeJson } from "@/lib/route-request";

// A read-only lookup, so it is a route handler rather than a server action: server actions share the
// router's one-at-a-time queue, and a slow lookup there can overwrite the URL after a navigation.
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const user = await requireUser();
  const { tripId } = await params;
  await assertTripAccess(tripId, user.id!, "viewer");
  const limited = rateLimitedResponse("mapboxRouting", user.id!);
  if (limited) return limited;

  const body = await readJsonObject(request);
  const parsed = body && parseDistanceBody(body);
  if (!parsed) return badRouteRequest();

  return routeJson(await getRouteDistanceTime(parsed.origin, parsed.destination, parsed.transitMode));
}
