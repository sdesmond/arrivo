import { afterEach, expect, it, vi } from "vitest";
import { assertWebMutation, assertWebRead } from "./csrf";
function request(headers: Record<string, string> = {}) {
  return new Request("http://arrivo.test:3000/api/v1/items", {
    method: "PATCH",
    headers: {
      "x-arrivo-client": "web",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
  });
}
it("requires web client, supported type and same-origin metadata", () => {
  expect(() => assertWebMutation(request())).not.toThrow();
  for (const headers of [
    { "x-arrivo-client": "" },
    { "content-type": "text/plain" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "cross-site" },
  ] as Record<string, string>[])
    expect(() => assertWebMutation(request(headers))).toThrow();
});
it("uses matching origin only when metadata is absent and preserves ports", () => {
  expect(() => assertWebMutation(request({ "sec-fetch-site": "", origin: "http://arrivo.test:3000" }))).not.toThrow();
  expect(() => assertWebMutation(request({ "sec-fetch-site": "", origin: "http://arrivo.test:4000" }))).toThrow();
  expect(() => assertWebMutation(request({ "sec-fetch-site": "" }))).toThrow();
  expect(() => assertWebMutation(request({ "sec-fetch-site": "", origin: "invalid" }))).toThrow();
});
it("accepts forwarded browser origin and multipart", () => {
  expect(() =>
    assertWebMutation(
      request({
        "sec-fetch-site": "",
        "x-forwarded-host": "public.test:443",
        "x-forwarded-proto": "https",
        origin: "https://public.test",
        "content-type": "multipart/form-data; boundary=test",
      })
    )
  ).not.toThrow();
});

afterEach(() => vi.unstubAllEnvs());
it("preserves nondefault forwarded ports and configured public origins", () => {
  const forwarded = {
    "sec-fetch-site": "",
    "x-forwarded-host": "public.test:8443, internal.test",
    "x-forwarded-proto": "https, http",
    origin: "https://public.test:8443",
  };
  expect(() => assertWebMutation(request(forwarded))).not.toThrow();
  expect(() => assertWebMutation(request({ ...forwarded, origin: "https://public.test" }))).toThrow();
  vi.stubEnv("NEXTAUTH_URL", "https://configured.test:9443");
  expect(() => assertWebMutation(request({ ...forwarded, origin: "https://configured.test:9443" }))).not.toThrow();
  expect(() => assertWebMutation(request(forwarded))).toThrow();
});

it("guards reads without requiring content type", () => {
  expect(() => assertWebRead(request({ "content-type": "" }))).not.toThrow();
  for (const headers of [{ "x-arrivo-client": "" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[])
    expect(() => assertWebRead(request(headers))).toThrow();
  expect(() =>
    assertWebRead(
      request({
        "sec-fetch-site": "",
        origin: "https://public.test",
        "x-forwarded-host": "public.test",
        "x-forwarded-proto": "https",
      })
    )
  ).not.toThrow();
});

function readRequest(headers: Record<string, string> = {}) {
  return new Request("http://arrivo.test:3000/api/v1/cover-images", {
    headers: { "x-arrivo-client": "web", ...headers },
  });
}
it("accepts same-origin HTTP Referer for GET when Origin and metadata are absent", () => {
  expect(() => assertWebRead(readRequest({ referer: "http://arrivo.test:3000/trips?tab=cover" }))).not.toThrow();
  expect(() =>
    assertWebRead(readRequest({ referer: "http://arrivo.test:3000/trips", "x-arrivo-client": "" }))
  ).toThrow();
});
it.each([undefined, "http://arrivo.test:4000/trips", "http://other.test:3000/trips", "invalid"])(
  "rejects missing or foreign GET Referer %s",
  (referer) => {
    expect(() => assertWebRead(readRequest(referer === undefined ? {} : { referer }))).toThrow();
  }
);
it("does not let Referer override explicit rejected Origin or metadata", () => {
  for (const headers of [
    { origin: "http://other.test:3000" },
    { origin: "invalid" },
    { origin: "" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "" },
  ] as Record<string, string>[]) {
    expect(() => assertWebRead(readRequest({ referer: "http://arrivo.test:3000/trips", ...headers }))).toThrow();
  }
});
it("limits Referer fallback to GET and resolves forwarded origins including ports", () => {
  const headers = { "x-arrivo-client": "web", referer: "http://arrivo.test:3000/trips" };
  expect(() =>
    assertWebRead(new Request("http://arrivo.test:3000/api/v1/items", { method: "PATCH", headers }))
  ).toThrow();
  expect(() =>
    assertWebMutation(
      new Request("http://arrivo.test:3000/api/v1/items", {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
      })
    )
  ).toThrow();
  const forwarded = {
    referer: "http://public.test:8080/trips",
    "x-forwarded-host": "public.test:8080",
    "x-forwarded-proto": "http",
  };
  expect(() => assertWebRead(readRequest(forwarded))).not.toThrow();
  expect(() => assertWebRead(readRequest({ ...forwarded, referer: "http://public.test/trips" }))).toThrow();
});
