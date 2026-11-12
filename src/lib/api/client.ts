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
/** A multipart upload sends up to 25 MB, so it gets longer than a JSON write unless the caller sets its own. */
export const UPLOAD_TIMEOUT_MS = 120_000;
function timeoutError(): ApiClientError {
  return new ApiClientError(0, "timeout", "The request timed out. Try again.");
}
export async function api<Result, Params extends z.ZodType, Body extends z.ZodType>(
  endpoint: Endpoint<Result, Params, Body>,
  input: { params: z.input<Params>; body: z.input<Body>; file?: File; timeoutMs?: number }
): Promise<Result> {
  const params = input.params as Record<string, string>;
  const path = endpoint.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, key: string) =>
    encodeURIComponent(params[key])
  );
  let headers: Record<string, string> = { "Content-Type": "application/json", "X-Arrivo-Client": "web" };
  let body: string | FormData = JSON.stringify(input.body);
  if (endpoint.multipart) {
    if (!input.file) throw new Error("A multipart request needs a file.");
    const form = new FormData();
    for (const [name, value] of Object.entries(input.body as Record<string, unknown>)) {
      if (value !== undefined) form.append(name, String(value));
    }
    form.append("file", input.file);
    // The browser sets the multipart content type with its boundary.
    headers = { "X-Arrivo-Client": "web" };
    body = form;
  }
  const controller = new AbortController();
  const timeoutMs = input.timeoutMs ?? (endpoint.multipart ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(path, {
        method: endpoint.method,
        credentials: "same-origin",
        headers,
        body,
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
    } catch {
      throw controller.signal.aborted
        ? timeoutError()
        : new ApiClientError(response.status, "server_error", "Could not save changes. Try again.");
    }
  } finally {
    clearTimeout(timer);
  }
}
