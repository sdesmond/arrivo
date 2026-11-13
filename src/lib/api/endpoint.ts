import type { z } from "zod";
/** Room for the form fields and part headers around a file, on top of the file limit. */
export const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
export interface Endpoint<Result, Params extends z.ZodType, Body extends z.ZodType> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  params: Params;
  /** Validates query fields for GET, or named multipart fields (file part separate), or the JSON body. */
  body: Body;
  /** Explicit wire status; 204 omits the serializable service result from the response. */
  status?: 200 | 204;
  /** Sends `multipart/form-data`: one `file` part plus the named fields of `body`. */
  multipart?: { maxFileBytes: number };
  /** Type-only result marker; never sent on the wire. */
  readonly result?: Result;
}
export function defineEndpoint<Result>() {
  return <Params extends z.ZodType, Body extends z.ZodType>(endpoint: Endpoint<Result, Params, Body>) => endpoint;
}
