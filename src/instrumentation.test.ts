// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fieldEncryption = vi.hoisted(() => ({
  MISSING_KEY_MESSAGE: "DATA_ENCRYPTION_KEY env var is missing or invalid",
  isFieldEncryptionConfigured: vi.fn(),
}));
vi.mock("@/lib/field-encryption", () => fieldEncryption);

import { register } from "./instrumentation";

describe("instrumentation register", () => {
  beforeEach(() => {
    fieldEncryption.isFieldEncryptionConfigured.mockReset();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
  });
  afterEach(() => vi.restoreAllMocks());

  it("does nothing when the key is configured", async () => {
    fieldEncryption.isFieldEncryptionConfigured.mockReturnValue(true);
    vi.stubEnv("NODE_ENV", "production");
    await expect(register()).resolves.toBeUndefined();
  });

  it("refuses to start a production server without the key", async () => {
    fieldEncryption.isFieldEncryptionConfigured.mockReturnValue(false);
    vi.stubEnv("NODE_ENV", "production");
    await expect(register()).rejects.toThrow(fieldEncryption.MISSING_KEY_MESSAGE);
  });

  it("only warns in development, with how to fix .env", async () => {
    fieldEncryption.isFieldEncryptionConfigured.mockReturnValue(false);
    vi.stubEnv("NODE_ENV", "development");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await register();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("Add it to .env"));
  });

  it("skips the check outside the Node runtime, so node:crypto stays out of the Edge bundle", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await register();
    expect(fieldEncryption.isFieldEncryptionConfigured).not.toHaveBeenCalled();
  });
});
