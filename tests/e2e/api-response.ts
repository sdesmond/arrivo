import type { Page, Response } from "@playwright/test";
interface WaitForApiResponseOptions {
  method: string;
  path: string;
  timeoutMs?: number;
}
/** Arm before the mutation gesture; await before reloading to prove persistence. */
export async function waitForApiResponse(
  page: Page,
  { method, path, timeoutMs = 5000 }: WaitForApiResponseOptions
): Promise<Response> {
  // A mistyped argument would otherwise just time out, so reject it by name instead.
  if (!/^[A-Za-z]+$/.test(method)) throw new Error(`Invalid API wait method ${JSON.stringify(method)}.`);
  if (!path.startsWith("/") || /[?#]/.test(path)) {
    throw new Error(`Invalid API wait path ${JSON.stringify(path)}: use an absolute pathname without ? or #.`);
  }
  const expectedMethod = method.toUpperCase();
  const response = await page.waitForResponse(
    (candidate) => candidate.request().method() === expectedMethod && new URL(candidate.url()).pathname === path,
    { timeout: timeoutMs }
  );
  if (!response.ok()) throw new Error(`API ${expectedMethod} ${path} failed with status ${response.status()}.`);
  return response;
}
