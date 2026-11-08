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
export async function api<Result, Params extends z.ZodType, Body extends z.ZodType>(
  endpoint: Endpoint<Result, Params, Body>,
  input: { params: z.input<Params>; body: z.input<Body> }
): Promise<Result> {
  const params = input.params as Record<string, string>;
  const path = endpoint.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, key: string) =>
    encodeURIComponent(params[key])
  );
  let response: Response;
  try {
    response = await fetch(path, {
      method: endpoint.method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-Arrivo-Client": "web" },
      body: JSON.stringify(input.body),
    });
  } catch {
    throw new ApiClientError(0, "network_error", "Could not reach the server. Try again.");
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
    }
    throw new ApiClientError(
      response.status,
      failure.error?.code ?? "server_error",
      failure.error?.message ?? "Could not save changes. Try again.",
      failure.error?.fields,
      failure.error?.requiredRole
    );
  }
  return response.json() as Promise<Result>;
}
