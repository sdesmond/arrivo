import { afterEach, expect, it, vi } from "vitest";
import { assertWebMutation } from "./csrf";
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
