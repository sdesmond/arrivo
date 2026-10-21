import { sql } from "drizzle-orm";
import { db } from "@/db";
import { checkHealth } from "@/lib/health";

// Unauthenticated (see PUBLIC_PATHS in proxy.ts) so the container HEALTHCHECK and proxies can probe it.
export async function GET() {
  const { status, body } = await checkHealth(() => db.execute(sql`select 1`));
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
