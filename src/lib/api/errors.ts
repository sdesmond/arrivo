import { z } from "zod";
import type { CollaboratorRole } from "@/data/types";
import { TripForbiddenError, TripNotFoundError } from "@/lib/services/trip-access";
import { ConflictError } from "@/lib/services/conflict-error";
import { ConfirmationRequiredError } from "@/lib/services/confirmation-required-error";
import { ValidationFailedError } from "@/lib/services/validation-failed-error";
import { RateLimitError } from "@/lib/rate-limit";
import { UploadInvalidError, UploadTooLargeError } from "@/lib/upload-policy";
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
    readonly requiredRole?: CollaboratorRole
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function errorResponse(error: unknown): Response {
  let failure: ApiError;
  let retryAfter: number | undefined;
  if (error instanceof ApiError) failure = error;
  else if (error instanceof TripNotFoundError) failure = new ApiError(404, "not_found", error.message);
  else if (error instanceof ConflictError) failure = new ApiError(409, "conflict", error.message);
  else if (error instanceof ConfirmationRequiredError)
    failure = new ApiError(409, "confirmation_required", error.message);
  else if (error instanceof ValidationFailedError)
    failure = new ApiError(422, "validation_failed", error.message, error.fields);
  else if (error instanceof UploadTooLargeError) failure = new ApiError(413, "payload_too_large", error.message);
  else if (error instanceof UploadInvalidError)
    failure = new ApiError(422, "validation_failed", error.message, { file: [error.message] });
  else if (error instanceof TripForbiddenError)
    failure = new ApiError(403, "forbidden", error.message, undefined, error.requiredRole);
  else if (error instanceof RateLimitError) {
    failure = new ApiError(429, "rate_limited", error.message);
    retryAfter = error.retryAfterSeconds;
  } else if (error instanceof z.ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const field = issue.path.join(".") || "body";
      (fields[field] ??= []).push(issue.message);
    }
    failure = new ApiError(422, "validation_failed", "Check the submitted fields.", fields);
  } else {
    const knownNames = [
      "Error",
      "TypeError",
      "RangeError",
      "SyntaxError",
      "ReferenceError",
      "URIError",
      "EvalError",
      "AggregateError",
    ];
    const errorName =
      error instanceof Error ? (knownNames.includes(error.name) ? error.name : "Error") : "UnknownError";
    console.error("[api] Unexpected error:", errorName);
    failure = new ApiError(500, "server_error", "Something went wrong. Try again.");
  }
  return Response.json(
    {
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.fields ? { fields: failure.fields } : {}),
        ...(failure.requiredRole ? { requiredRole: failure.requiredRole } : {}),
      },
    },
    {
      status: failure.status,
      headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) },
    }
  );
}
