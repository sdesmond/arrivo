// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptField,
  decryptOptionalField,
  encryptField,
  encryptOptionalField,
  isEncryptedField,
  isFieldEncryptionConfigured,
} from "./field-encryption";

const TEST_KEY = randomBytes(32).toString("base64");

describe("field encryption", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a value through encrypt and decrypt", () => {
    const encrypted = encryptField("X1234567");
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(encrypted).not.toContain("X1234567");
    expect(decryptField(encrypted)).toBe("X1234567");
  });

  it("uses a fresh IV for every call", () => {
    expect(encryptField("same")).not.toBe(encryptField("same"));
  });

  it("passes legacy plaintext through on decrypt", () => {
    expect(decryptField("X1234567")).toBe("X1234567");
  });

  it("flags only prefixed values as encrypted", () => {
    expect(isEncryptedField(encryptField("abc"))).toBe(true);
    expect(isEncryptedField("abc")).toBe(false);
  });

  it("throws when the ciphertext was tampered with", () => {
    const encrypted = encryptField("X1234567");
    const parts = encrypted.split(":");
    const payload = Buffer.from(parts[3], "base64");
    payload[0] ^= 0xff;
    parts[3] = payload.toString("base64");
    expect(() => decryptField(parts.join(":"))).toThrow();
  });

  it("throws when the value is prefixed but malformed", () => {
    expect(() => decryptField("enc:v1:onlyonepart")).toThrow("Malformed encrypted field");
  });

  it("fails to decrypt with a different key", () => {
    const encrypted = encryptField("X1234567");
    vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => decryptField(encrypted)).toThrow();
  });

  it("throws a clear error when the key is missing", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    expect(() => encryptField("abc")).toThrow("DATA_ENCRYPTION_KEY");
  });

  it("throws a clear error when the key is the wrong length", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    expect(() => encryptField("abc")).toThrow("DATA_ENCRYPTION_KEY");
  });

  it("leaves null, undefined and empty optional values alone", () => {
    expect(encryptOptionalField(null)).toBeNull();
    expect(encryptOptionalField(undefined)).toBeUndefined();
    expect(encryptOptionalField("")).toBe("");
    expect(decryptOptionalField(null)).toBeNull();
    expect(decryptOptionalField(undefined)).toBeUndefined();
  });

  it("encrypts and decrypts present optional values", () => {
    const encrypted = encryptOptionalField("TT-1");
    expect(isEncryptedField(encrypted!)).toBe(true);
    expect(decryptOptionalField(encrypted)).toBe("TT-1");
  });

  it("reports whether a usable key is configured, without throwing", () => {
    expect(isFieldEncryptionConfigured()).toBe(true);
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    expect(isFieldEncryptionConfigured()).toBe(false);
    vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    expect(isFieldEncryptionConfigured()).toBe(false);
  });
});
