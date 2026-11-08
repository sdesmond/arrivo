import type { Page, Response } from "@playwright/test";
interface WaitForApiResponseOptions {
  method: string;
  path: string;
  timeoutMs?: number;
}
/** Arm before the mutation gesture; await before reloading to prove persistence. */
export function waitForApiResponse(
  page: Page,
  { method, path, timeoutMs = 5000 }: WaitForApiResponseOptions
): Promise<Response> {
  return page
    .waitForResponse(
      (response) => response.request().method() === method && new URL(response.url()).pathname === path,
      { timeout: timeoutMs }
    )
    .then((response) => {
      if (!response.ok()) throw new Error(`API ${method} ${path} failed with status ${response.status()}.`);
      return response;
    });
}
