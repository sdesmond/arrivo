import { expect, type APIResponse, type Page } from "@playwright/test";
import { When, Then } from "../fixtures";
import { MAX_COVER_SEARCH_PAGE } from "../../../src/lib/validation-limits";
const responses = new WeakMap<
  Page,
  { status: number; headers: Record<string, string>; text: string; testCase: string }
>();
async function remember(page: Page, response: APIResponse, testCase: string) {
  responses.set(page, {
    status: response.status(),
    headers: response.headers(),
    text: await response.text(),
    testCase,
  });
}
When("I request cover search case {string}", async ({ page, playwright }, testCase: string) => {
  const destination = testCase.startsWith("destination");
  const queries: Record<string, string> = {
    empty: "query=",
    "page-zero": "query=Paris&page=0",
    "page-above-cap": "query=Paris&page=" + (MAX_COVER_SEARCH_PAGE + 1),
    repeated: "query=Paris&query=Rome",
    "page-two": "query=Paris&page=2&perPage=2",
  };
  const path =
    "/api/v1/cover-images" +
    (destination ? "/destination?name=Paris" : "?" + (queries[testCase] ?? "query=Paris&perPage=2"));
  const cross = testCase === "cross-origin" || testCase === "destination-cross";
  const headers: Record<string, string> = cross
    ? { origin: "https://other.example", "sec-fetch-site": "cross-site" }
    : { "x-arrivo-client": "web", origin: new URL(page.url()).origin };
  if (testCase === "http-referer") {
    delete headers.origin;
    headers.referer = page.url();
  }
  if (testCase === "keyed") headers["idempotency-key"] = "read-key";
  if (testCase === "signed-out") {
    const anonymous = await playwright.request.newContext({
      baseURL: new URL(page.url()).origin,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const response = await anonymous.get(path, { headers });
      expect(response.status(), await response.text()).toBe(401);
      await remember(page, response, testCase);
    } finally {
      await anonymous.dispose();
    }
  } else await remember(page, await page.request.get(path, { headers }), testCase);
});
Then("the cover search response is {int}", async ({ page }, status: number) => {
  const current = responses.get(page)!;
  expect(current.status, current.text).toBe(status);
  expect(current.headers["cache-control"]).toBe("no-store");
  if (status !== 200) {
    const failure = JSON.parse(current.text) as { error: { code: string; fields?: Record<string, string[]> } };
    const codes: Record<number, string> = {
      401: "unauthenticated",
      403: "forbidden",
      422: "validation_failed",
      400: "bad_request",
    };
    expect(failure.error.code).toBe(codes[status]);
    if (status === 422) {
      const field = current.testCase === "empty" ? "query" : "page";
      expect(failure.error.fields?.[field]).toEqual(expect.arrayContaining([expect.any(String)]));
    }
  }
  if (status === 200) {
    const body = JSON.parse(current.text) as {
      center: [number, number];
      images: Array<{ id: string; photographerUrl: string }>;
    };
    if (current.testCase === "destination") expect(body).toEqual({ center: [2.3488, 48.8534] });
    else {
      expect(body.images).toHaveLength(2);
      expect(body.images[0]).toMatchObject({
        id: current.testCase === "page-two" ? "stub-paris-3" : "stub-paris-1",
        photographerUrl:
          current.testCase === "page-two"
            ? "https://unsplash.com/@stub-photographer-3"
            : "https://unsplash.com/@stub-photographer-1",
      });
    }
  }
});
