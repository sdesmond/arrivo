import { headers } from "next/headers";
import { apiRoute } from "@/lib/api/route";
import { createTrip, listTrips } from "@/lib/api/contract/trips";
import { createTrip as create, listTrips as list } from "@/lib/services/trips";

export const GET = apiRoute(listTrips, ({ actor, body }) => list(actor, body));

export const POST = apiRoute(
  createTrip,
  async ({ actor, body, replay }) =>
    create(actor, body, replay, { acceptLanguage: (await headers()).get("accept-language") ?? "" }),
  { idempotent: {} }
);
