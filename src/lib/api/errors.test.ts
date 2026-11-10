import { afterEach, expect, it, vi } from "vitest";
import { ApiError, errorResponse } from "./errors";
import { TripForbiddenError, TripNotFoundError } from "@/lib/services/trip-access";
import { ConflictError } from "@/lib/services/conflict-error";
import { RateLimitError } from "@/lib/rate-limit";
import { z } from "zod";
it.each([
  [new TripNotFoundError(), 404, "not_found"],
  [new TripForbiddenError("editor"), 403, "forbidden"],
  [new ConflictError("Reused ID."), 409, "conflict"],
  [new RateLimitError(12), 429, "rate_limited"],
  [new ApiError(401, "unauthenticated", "Sign in."), 401, "unauthenticated"],
  [new ApiError(403, "mfa_enrollment_required", "Enroll MFA."), 403, "mfa_enrollment_required"],
  [new ApiError(400, "bad_request", "Invalid JSON."), 400, "bad_request"],
  [new Error("private SQL"), 500, "server_error"],
] as const)("maps %s to no-store status %s code %s without internals", async (error, status, code) => {
  const response = errorResponse(error);
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body.error.code).toBe(code);
  expect(JSON.stringify(body)).not.toContain("private SQL");
  if (status === 429) expect(response.headers.get("retry-after")).toBe("12");
  if (code === "forbidden") expect(body.error.requiredRole).toBe("editor");
});
it("returns validation fields", async () => {
  const parsed = z.object({ isChecked: z.boolean() }).safeParse({ isChecked: "no" });
  if (parsed.success) throw new Error("expected validation error");
  const response = errorResponse(parsed.error);
  expect(response.status).toBe(422);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).error.fields.isChecked).toBeDefined();
});

afterEach(() => vi.restoreAllMocks());
it("logs only a sanitized unexpected error name", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  errorResponse(new TypeError("SELECT private identifiers"));
  expect(log).toHaveBeenLastCalledWith("[api] Unexpected error:", "TypeError");
  const error = new Error("SQL user secret");
  error.name = "DatabaseError private-id";
  errorResponse(error);
  expect(log).toHaveBeenLastCalledWith("[api] Unexpected error:", "Error");
  errorResponse("private primitive");
  expect(log).toHaveBeenLastCalledWith("[api] Unexpected error:", "UnknownError");
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/SELECT|identifiers|private|SQL|secret/);
});
