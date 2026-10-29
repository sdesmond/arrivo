import {
  passwordResetCookie,
  clearedPasswordResetCookie,
  resolvePasswordResetContext,
} from "@/lib/password-reset-session";
import { browserUrl, isHttpsRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

// Reset-link exchange. The link is `/account-reset/open?token=...`; this validates it (never consuming or extending
// it), swaps the token for a limited HttpOnly cookie, and redirects to a query-free URL so the token leaves the
// address bar, history and any Referer. Without a token it only clears the cookie, which is how the page drops a
// context that is no longer valid. Every failure ends on the same generic page.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? undefined;
  const https = isHttpsRequest(request.headers);

  const headers = new Headers({
    Location: browserUrl("/account-reset", request).toString(),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });

  const context = await resolvePasswordResetContext(token, { headers: request.headers, countAttempt: true });
  headers.append(
    "Set-Cookie",
    context.status === "ready" && token
      ? passwordResetCookie(token, context.account.expiresAt, { https })
      : clearedPasswordResetCookie(https)
  );
  return new Response(null, { status: 303, headers });
}
