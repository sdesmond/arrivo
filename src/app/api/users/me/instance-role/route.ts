import "server-only";
import { requireUser } from "@/lib/auth-helpers";
import { isInstanceAdmin } from "@/lib/instance-roles";

export async function GET() {
  const user = await requireUser();
  const isAdmin = await isInstanceAdmin(user.id!);
  return Response.json({ isAdmin }, { headers: { "Cache-Control": "no-store" } });
}
