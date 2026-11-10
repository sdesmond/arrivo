import type { z } from "zod";
import type { CollaboratorRole } from "@/data/types";
import type { Endpoint } from "./endpoint";
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string[]>,
    readonly requiredRole?: CollaboratorRole
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}
/**
 * How long one request, including reading its body, may take. It sits above normal latency and the trip-lock wait, and
 * frees a keyed write queue that a hung request would otherwise stall.
 */
export const REQUEST_TIMEOUT_MS = 30_000;
function timeoutError(): ApiClientError {
  return new ApiClientError(0, "timeout", "The request timed out. Try again.");
}
export async function api<Result, Params extends z.ZodType, Body extends z.ZodType>(
  endpoint: Endpoint<Result, Params, Body>,
  input: { params: z.input<Params>; body: z.input<Body> }
): Promise<Result> {
  const params = input.params as Record<string, string>;
  const path = endpoint.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, key: string) =>
    encodeURIComponent(params[key])
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(path, {
        method: endpoint.method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Arrivo-Client": "web" },
        body: JSON.stringify(input.body),
        signal: controller.signal,
      });
    } catch {
      throw controller.signal.aborted
        ? timeoutError()
        : new ApiClientError(0, "network_error", "Could not reach the server. Try again.");
    }
    if (!response.ok) {
      let failure: {
        error?: { code?: string; message?: string; fields?: Record<string, string[]>; requiredRole?: CollaboratorRole };
      } = {};
      try {
        const envelope: unknown = await response.json();
        if (envelope !== null && typeof envelope === "object" && !Array.isArray(envelope)) {
          const candidate = (envelope as { error?: unknown }).error;
          if (candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)) {
            failure = { error: candidate as NonNullable<typeof failure.error> };
          }
        }
      } catch {
        /* A proxy may return HTML. */
        if (controller.signal.aborted) throw timeoutError();
      }
      throw new ApiClientError(
        response.status,
        failure.error?.code ?? "server_error",
        failure.error?.message ?? "Could not save changes. Try again.",
        failure.error?.fields,
        failure.error?.requiredRole
      );
    }
    if (endpoint.status === 204) return null as Result;
    if (response.status === 204) {
      throw new ApiClientError(204, "server_error", "Could not save changes. Try again.");
    }
    try {
      return (await response.json()) as Result;
    } catch (error) {
      throw controller.signal.aborted ? timeoutError() : error;
    }
  } finally {
    clearTimeout(timer);
  }
}
