import { API_META } from "@/lib/api/contract/meta";

// Unauthenticated by design (`/api/v1` is in PUBLIC_PATHS in src/proxy.ts) so a client can discover the API before
// signing in. This is the one v1 route exempt from `apiRoute`; see EXEMPT in src/lib/api/handler-coverage.test.ts.
export function GET() {
  return Response.json(API_META, { headers: { "Cache-Control": "no-store" } });
}
