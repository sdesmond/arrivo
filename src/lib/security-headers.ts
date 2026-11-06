// Response headers sent on every route (wired in next.config.ts). Kept in a plain module so a unit test can pin them.
//
// Deliberately absent: a script-src/img-src Content-Security-Policy and `upgrade-insecure-requests`. Next.js
// hydration needs inline scripts (a safe CSP needs per-request nonces), Mapbox GL needs blob: workers, and
// self-hosted installs often run on plain HTTP on a LAN address. Add those only with browser verification.

export interface SecurityHeader {
  key: string;
  value: string;
}

const SIX_MONTHS_IN_SECONDS = 15_552_000;

export const SECURITY_HEADERS: SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The document viewer frames same-origin PDFs, so SAMEORIGIN rather than DENY.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The Now card and routing ask for the device location.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
  // Browsers ignore HSTS on plain HTTP, so this is inert for LAN installs and protective behind HTTPS.
  { key: "Strict-Transport-Security", value: `max-age=${SIX_MONTHS_IN_SECONDS}` },
];
