import "server-only";
import type { z } from "zod";
import type { Actor } from "@/data/types";
import type { Endpoint } from "./endpoint";
import { requireApiUser } from "./auth";
import { assertWebMutation } from "./csrf";
import { ApiError, errorResponse } from "./errors";
import { assertWithinRateLimit } from "@/lib/rate-limit";
export function apiRoute<Result, Params extends z.ZodType, Body extends z.ZodType>(
  endpoint: Endpoint<Result, Params, Body>,
  handler: (input: { actor: Actor; params: z.output<Params>; body: z.output<Body> }) => Promise<Result>
) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const actor = await requireApiUser();
      assertWebMutation(request);
      assertWithinRateLimit("api", actor.userId);
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
      const result = await handler({ actor, params, body });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
