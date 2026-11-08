import "server-only";
import { browserUrl } from "@/lib/request-origin";
import { ApiError } from "./errors";
export function assertWebMutation(request: Request): void {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const site = request.headers.get("sec-fetch-site");
  let sameOrigin = site === "same-origin";
  if (!site) {
    try {
      const origin = request.headers.get("origin");
      sameOrigin = !!origin && new URL(origin).origin === browserUrl("/", request).origin;
    } catch {
      sameOrigin = false;
    }
  }
  if (
    request.headers.get("x-arrivo-client") !== "web" ||
    !["application/json", "multipart/form-data"].includes(contentType ?? "") ||
    !sameOrigin
  )
    throw new ApiError(403, "forbidden", "Request origin is not allowed.");
}
