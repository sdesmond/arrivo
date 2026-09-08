import "server-only";
import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { createLiveSyncResponse, subscribeUser } from "@/lib/trip-events";

export async function GET(request: NextRequest) {
  const user = await requireUser();

  return createLiveSyncResponse(request.signal, (callback) => subscribeUser(user.id!, callback));
}
