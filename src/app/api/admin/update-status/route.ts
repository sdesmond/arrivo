import "server-only";
import { requireUser } from "@/lib/auth-helpers";
import { isAppAdmin } from "@/lib/app-roles";
import { getAvailableUpdate } from "@/lib/update-check";

export async function GET() {
  const user = await requireUser();
  const update = (await isAppAdmin(user.id!)) ? await getAvailableUpdate() : null;
  return Response.json({ update }, { headers: { "Cache-Control": "no-store" } });
}
