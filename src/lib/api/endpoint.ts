import type { z } from "zod";
export interface Endpoint<Result, Params extends z.ZodType, Body extends z.ZodType> {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  params: Params;
  body: Body;
  /** Type-only result marker; never sent on the wire. */
  readonly result?: Result;
}
export function defineEndpoint<Result>() {
  return <Params extends z.ZodType, Body extends z.ZodType>(endpoint: Endpoint<Result, Params, Body>) => endpoint;
}
