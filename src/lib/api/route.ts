import "server-only";
import type { z } from "zod";
import type { Actor, IdempotentRequest } from "@/data/types";
import type { Endpoint } from "./endpoint";
import { requireApiUser } from "./auth";
import { assertWebMutation } from "./csrf";
import { ApiError, errorResponse } from "./errors";
import { concretePath, parseIdempotencyKey } from "./idempotency";
import { assertWithinRateLimit } from "@/lib/rate-limit";
export interface ApiRouteOptions {
  /** Opt in to `Idempotency-Key` replay; a keyed request to any other handler is rejected. */
  idempotent?: { expiryMs?: number };
}
export function apiRoute<Result, Params extends z.ZodType, Body extends z.ZodType>(
  endpoint: Endpoint<Result, Params, Body>,
  handler: (input: {
    actor: Actor;
    params: z.output<Params>;
    body: z.output<Body>;
    replay?: IdempotentRequest;
  }) => Promise<Result>,
  options: ApiRouteOptions = {}
) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const actor = await requireApiUser();
      assertWebMutation(request);
      assertWithinRateLimit("api", actor.userId);
      const header = request.headers.get("idempotency-key");
      if (header !== null && !options.idempotent)
        throw new ApiError(400, "bad_request", "Idempotency-Key is not supported for this endpoint.");
      const params = endpoint.params.parse(await context.params);
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        throw new ApiError(400, "bad_request", "Malformed JSON body.");
      }
      if (raw === null || typeof raw !== "object" || Array.isArray(raw))
        throw new ApiError(400, "bad_request", "Expected an object body.");
      const body = endpoint.body.parse(raw);
      let replay: IdempotentRequest | undefined;
      if (header !== null && options.idempotent) {
        replay = {
          key: parseIdempotencyKey(header)!,
          method: endpoint.method,
          path: concretePath(endpoint.path, params as Record<string, string>),
          ...(options.idempotent.expiryMs === undefined ? {} : { expiryMs: options.idempotent.expiryMs }),
        };
      }
      const result = await handler({ actor, params, body, ...(replay ? { replay } : {}) });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
