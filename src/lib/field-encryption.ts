import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Not marked server-only: the bundled migrator (src/db/migrate-cli.ts) and the seed script import it
// outside Next.js, where the server-only guard would throw. node:crypto keeps it out of client bundles anyway.

const PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const MISSING_KEY_MESSAGE =
  "DATA_ENCRYPTION_KEY env var is missing or invalid — it must be 32 random bytes, base64-encoded. Generate one with " +
  "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` (or run `npm run setup:dev`) " +
  "and never change it once set.";

let cachedKey: { source: string; key: Buffer } | undefined;

function readKey(): Buffer | undefined {
  const source = process.env.DATA_ENCRYPTION_KEY ?? "";
  if (cachedKey?.source === source) return cachedKey.key;

  const key = Buffer.from(source, "base64");
  if (key.length !== 32) return undefined;
  cachedKey = { source, key };
  return key;
}

function getKey(): Buffer {
  const key = readKey();
  if (!key) throw new Error(MISSING_KEY_MESSAGE);
  return key;
}

// Lets features that store encrypted data explain what's wrong instead of failing with a 500.
export function isFieldEncryptionConfigured(): boolean {
  return readKey() !== undefined;
}

export function isEncryptedField(value: string): boolean {
  return value.startsWith(PREFIX);
}

// Format: enc:v1:<iv base64>:<ciphertext + auth tag base64>
export function encryptField(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const payload = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${PREFIX}${iv.toString("base64")}:${payload.toString("base64")}`;
}

// Values written before encryption existed carry no prefix and pass through unchanged.
export function decryptField(value: string): string {
  if (!isEncryptedField(value)) return value;

  const [ivPart, payloadPart] = value.slice(PREFIX.length).split(":");
  if (!ivPart || !payloadPart) throw new Error("Malformed encrypted field.");

  const payload = Buffer.from(payloadPart, "base64");
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(payload.subarray(payload.length - TAG_BYTES));
  return Buffer.concat([decipher.update(payload.subarray(0, payload.length - TAG_BYTES)), decipher.final()]).toString(
    "utf8"
  );
}

export function encryptOptionalField<T extends string | null | undefined>(value: T): T {
  return (value ? encryptField(value) : value) as T;
}

export function decryptOptionalField<T extends string | null | undefined>(value: T): T {
  return (value ? decryptField(value) : value) as T;
}
