// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { SECURITY_HEADERS } from "./security-headers";

function headerValue(key: string): string | undefined {
  return SECURITY_HEADERS.find((header) => header.key === key)?.value;
}

describe("SECURITY_HEADERS", () => {
  it("stops MIME sniffing", () => {
    expect(headerValue("X-Content-Type-Options")).toBe("nosniff");
  });

  it("blocks framing by other origins but keeps same-origin framing for the PDF viewer", () => {
    expect(headerValue("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headerValue("Content-Security-Policy")).toBe("frame-ancestors 'self'");
  });

  it("limits referrers to the origin on cross-origin requests", () => {
    expect(headerValue("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("keeps geolocation for the app and denies camera, microphone and payment", () => {
    const policy = headerValue("Permissions-Policy");
    expect(policy).toContain("geolocation=(self)");
    expect(policy).toContain("camera=()");
    expect(policy).toContain("microphone=()");
    expect(policy).toContain("payment=()");
  });

  it("sets HSTS without subdomain or preload commitments", () => {
    const value = headerValue("Strict-Transport-Security");
    expect(value).toMatch(/^max-age=\d+$/);
  });

  it("never forces https or blocks scripts, which would break plain-HTTP self-hosted installs", () => {
    const csp = headerValue("Content-Security-Policy") ?? "";
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("script-src");
  });

  it("sends each header once", () => {
    const keys = SECURITY_HEADERS.map((header) => header.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("next.config headers()", () => {
  it("applies the security headers to every route", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([{ source: "/:path*", headers: SECURITY_HEADERS }]);
  });
});
