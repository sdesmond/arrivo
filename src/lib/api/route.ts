import "server-only";
import type { z } from "zod";
import type { Actor, IdempotentRequest } from "@/data/types";
import { MULTIPART_OVERHEAD_BYTES, type Endpoint } from "./endpoint";
import { requireApiUser } from "./auth";
import { assertWebMutation, assertWebRead } from "./csrf";
import { ApiError, errorResponse } from "./errors";
import { concretePath, parseIdempotencyKey } from "./idempotency";
import { assertWithinRateLimit } from "@/lib/rate-limit";
interface ApiRouteOptions {
  /** Opt in to `Idempotency-Key` replay; a keyed request to any other handler is rejected. */
  idempotent?: { expiryMs?: number };
}
/**
 * Reads one `file` part and the named string fields. Next buffers a proxied body only up to its limit and truncates
 * silently, so an oversize body is refused from Content-Length before it is read.
 */
async function readMultipart(
  request: Request,
  maxFileBytes: number
): Promise<{ fields: Record<string, string>; file: File }> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxFileBytes + MULTIPART_OVERHEAD_BYTES)
    throw new ApiError(413, "payload_too_large", "The upload is too large.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, "bad_request", "Malformed multipart body.");
  }
  const fields: Record<string, string> = {};
  let file: File | undefined;
  for (const [name, value] of form.entries()) {
    if (typeof value === "string") {
      if (name === "file" || name in fields) throw new ApiError(400, "bad_request", "Repeated or misplaced field.");
      fields[name] = value;
    } else {
      if (name !== "file" || file) throw new ApiError(400, "bad_request", "Expected one file part named file.");
      file = value;
    }
  }
  if (!file)
    throw new ApiError(422, "validation_failed", "Check the submitted fields.", { file: ["A file is required."] });
  return { fields, file };
}
export function apiRoute<Result, Params extends z.ZodType, Body extends z.ZodType>(
  endpoint: Endpoint<Result, Params, Body>,
  handler: (input: {
    actor: Actor;
    params: z.output<Params>;
    body: z.output<Body>;
    /** The `file` part of a multipart endpoint; absent for JSON endpoints. */
    file?: File;
    replay?: IdempotentRequest;
  }) => Promise<Result>,
  options: ApiRouteOptions = {}
) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }): Promise<Response> => {
    try {
      const actor = await requireApiUser();
      if (endpoint.method === "GET") assertWebRead(request);
      else assertWebMutation(request);
      assertWithinRateLimit("api", actor.userId);
      const header = request.headers.get("idempotency-key");
      if (header !== null && (endpoint.method === "GET" || !options.idempotent))
        throw new ApiError(400, "bad_request", "Idempotency-Key is not supported for this endpoint.");
      const params = endpoint.params.parse((await context.params) ?? {});
      let file: File | undefined;
      let raw: unknown;
      if (endpoint.method === "GET") {
        const fields: Record<string, string> = Object.create(null);
        for (const [name, value] of new URL(request.url).searchParams) {
          if (Object.hasOwn(fields, name)) throw new ApiError(400, "bad_request", "Repeated query field.");
          fields[name] = value;
        }
        raw = fields;
      } else if (endpoint.multipart) {
        ({ fields: raw, file } = await readMultipart(request, endpoint.multipart.maxFileBytes));
      } else {
        try {
          raw = await request.json();
        } catch {
          throw new ApiError(400, "bad_request", "Malformed JSON body.");
        }
        if (raw === null || typeof raw !== "object" || Array.isArray(raw))
          throw new ApiError(400, "bad_request", "Expected an object body.");
      }
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
      const result = await handler({
        actor,
        params,
        body,
        ...(file ? { file } : {}),
        ...(replay ? { replay } : {}),
      });
      if (endpoint.status === 204) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
