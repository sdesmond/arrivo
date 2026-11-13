import "server-only";
import { browserUrl } from "@/lib/request-origin";
import { ApiError } from "./errors";
function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  let sameOrigin = site === "same-origin";
  if (!site) {
    try {
      const origin =
        request.headers.get("origin") ??
        (site === null && request.method === "GET" ? request.headers.get("referer") : null);
      sameOrigin = !!origin && new URL(origin).origin === browserUrl("/", request).origin;
    } catch {
      sameOrigin = false;
    }
  }
  return sameOrigin;
}
export function assertWebRead(request: Request): void {
  if (request.headers.get("x-arrivo-client") !== "web" || !isSameOrigin(request))
    throw new ApiError(403, "forbidden", "Request origin is not allowed.");
}
export function assertWebMutation(request: Request): void {
  assertWebRead(request);
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!["application/json", "multipart/form-data"].includes(contentType ?? ""))
    throw new ApiError(403, "forbidden", "Request origin is not allowed.");
}
