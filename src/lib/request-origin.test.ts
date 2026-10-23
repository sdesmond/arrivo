// @vitest-environment node
import { describe, expect, it } from "vitest";
import { browserUrl, isHttpsRequest } from "./request-origin";

// What the standalone server reports in req.url: its own listen address, not the browser's.
const SERVER_URL = "http://localhost:4850/trips";

function request(headers: Record<string, string>, url = SERVER_URL) {
  return { url, headers: new Headers(headers) };
}

describe("browserUrl", () => {
  it("uses the Host the browser sent instead of the server's listen address", () => {
    expect(browserUrl("/sign-in", request({ host: "192.168.1.50:4850" }), {}).href).toBe(
      "http://192.168.1.50:4850/sign-in"
    );
  });

  it("prefers the reverse proxy's X-Forwarded-Host and X-Forwarded-Proto", () => {
    const behindProxy = request({
      host: "127.0.0.1:4850",
      "x-forwarded-host": "arrivo.example.com",
      "x-forwarded-proto": "https",
    });

    expect(browserUrl("/sign-in", behindProxy, {}).href).toBe("https://arrivo.example.com/sign-in");
  });

  it("takes the first entry when proxies chain forwarded headers", () => {
    const chained = request({
      "x-forwarded-host": "arrivo.example.com, internal-proxy:8080",
      "x-forwarded-proto": "https, http",
    });

    expect(browserUrl("/sign-in", chained, {}).href).toBe("https://arrivo.example.com/sign-in");
  });

  it("defers to req.url when NEXTAUTH_URL or AUTH_URL is set, since Auth.js already applied it there", () => {
    const rewritten = request({ host: "127.0.0.1:4850" }, "https://arrivo.example.com/trips");

    expect(browserUrl("/sign-in", rewritten, { NEXTAUTH_URL: "https://arrivo.example.com" }).href).toBe(
      "https://arrivo.example.com/sign-in"
    );
    expect(browserUrl("/sign-in", rewritten, { AUTH_URL: "https://arrivo.example.com" }).href).toBe(
      "https://arrivo.example.com/sign-in"
    );
  });

  it("falls back to req.url when no host header is present", () => {
    expect(browserUrl("/sign-in", request({}), {}).href).toBe("http://localhost:4850/sign-in");
  });
});

describe("isHttpsRequest", () => {
  it("trusts the first X-Forwarded-Proto entry", () => {
    expect(isHttpsRequest(new Headers({ "x-forwarded-proto": "https, http" }), {})).toBe(true);
    expect(isHttpsRequest(new Headers({ "x-forwarded-proto": "http" }), { NEXTAUTH_URL: "https://a.example" })).toBe(
      false
    );
  });

  it("falls back to NEXTAUTH_URL or AUTH_URL", () => {
    expect(isHttpsRequest(new Headers(), { NEXTAUTH_URL: "https://a.example" })).toBe(true);
    expect(isHttpsRequest(new Headers(), { AUTH_URL: "https://a.example" })).toBe(true);
    expect(isHttpsRequest(new Headers(), { NEXTAUTH_URL: "http://a.example" })).toBe(false);
    expect(isHttpsRequest(new Headers(), {})).toBe(false);
  });
});
