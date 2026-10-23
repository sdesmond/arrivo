import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { Secret, TOTP } from "otpauth";

const ISSUER = "Arrivo";
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const RECOVERY_CODE_COUNT = 10;
// No 0/o, 1/l/i: recovery codes get read off paper.
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const MFA_TICKET_TTL_MS = 5 * 60_000;
// Carries the signed "password step passed" ticket from the password form to the code form.
export const MFA_COOKIE = "arrivo_mfa";

function buildTotp(secretBase32: string, label?: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD_SECONDS,
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(username: string, secretBase32: string): string {
  return buildTotp(secretBase32, username).toString();
}

export type TotpResult = { ok: true; step: number } | { ok: false };

// Accepts one step of clock drift either way. `lastStep` is the step of the last accepted code: anything at or
// before it is a replay of a code someone may have watched being typed.
export function verifyTotp(secretBase32: string, code: string, lastStep: number | null, now = Date.now()): TotpResult {
  const token = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${DIGITS}}$`).test(token)) return { ok: false };

  const delta = buildTotp(secretBase32).validate({ token, timestamp: now, window: 1 });
  if (delta === null) return { ok: false };

  const step = Math.floor(now / 1000 / PERIOD_SECONDS) + delta;
  if (lastStep !== null && step <= lastStep) return { ok: false };
  return { ok: true, step };
}

export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isRecoveryCodeFormat(code: string): boolean {
  return normalizeRecoveryCode(code).length === 10;
}

export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) {
    let raw = "";
    for (let i = 0; i < 10; i++) raw += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return [...codes];
}

// ~50 bits of randomness per code, so a fast hash is enough; bcrypt would only slow sign-in.
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

// Short-lived proof that a user passed the password step, carried in an httpOnly cookie to the code step so the
// password never has to be sent twice.
function ticketSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET env var is missing — required to sign two-factor tickets.");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", ticketSecret()).update(payload).digest("base64url");
}

export interface MfaTicket {
  userId: string;
  keepSignedIn: boolean;
}

export function createMfaTicket(userId: string, { keepSignedIn }: { keepSignedIn: boolean }, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ userId, keepSignedIn, expiresAt: now + MFA_TICKET_TTL_MS })).toString(
    "base64url"
  );
  return `${payload}.${sign(payload)}`;
}

export function verifyMfaTicket(ticket: string, now = Date.now()): MfaTicket | null {
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const { userId, expiresAt, keepSignedIn } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof userId !== "string" || typeof expiresAt !== "number" || expiresAt < now) return null;
    return { userId, keepSignedIn: keepSignedIn !== false };
  } catch {
    return null;
  }
}
