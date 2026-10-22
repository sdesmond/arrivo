interface RequestLike {
  url: string;
  headers: Headers;
}

interface OriginEnv {
  NEXTAUTH_URL?: string;
  AUTH_URL?: string;
  [name: string]: string | undefined;
}

const firstValue = (header: string | null) => header?.split(",")[0].trim() || undefined;

// Absolute URL for `path` on the address the browser used. The standalone server puts its own listen
// address in req.url (e.g. localhost:3550), so a redirect built from it sends LAN and proxied users to
// the wrong host. AUTH_TRUST_HOST already trusts these headers for Auth.js; an explicit NEXTAUTH_URL /
// AUTH_URL wins because Auth.js has applied it to req.url.
export function browserUrl(path: string, request: RequestLike, env: OriginEnv = process.env): URL {
  if (env.NEXTAUTH_URL || env.AUTH_URL) return new URL(path, request.url);

  const host = firstValue(request.headers.get("x-forwarded-host")) ?? firstValue(request.headers.get("host"));
  if (!host) return new URL(path, request.url);

  const protocol =
    firstValue(request.headers.get("x-forwarded-proto")) ?? new URL(request.url).protocol.replace(":", "");
  return new URL(path, `${protocol}://${host}`);
}

// Mirrors Auth.js: cookies are Secure only when the browser reached us over HTTPS, so plain-HTTP LAN installs work.
export function isHttpsRequest(headers: Headers, env: OriginEnv = process.env): boolean {
  const forwardedProto = firstValue(headers.get("x-forwarded-proto"));
  if (forwardedProto) return forwardedProto === "https";
  return (env.NEXTAUTH_URL ?? env.AUTH_URL ?? "").startsWith("https:");
}
