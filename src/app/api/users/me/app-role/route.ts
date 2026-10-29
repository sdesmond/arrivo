import "server-only";
import { requireUser } from "@/lib/auth-helpers";
import { isAppAdmin } from "@/lib/app-roles";

export async function GET() {
  const user = await requireUser();
  const isAdmin = await isAppAdmin(user.id!);
  return Response.json({ isAdmin }, { headers: { "Cache-Control": "no-store" } });
}
