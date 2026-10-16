// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { CredentialsSignin } from "@auth/core/errors";
import { formatAuthError, logAuthError, shouldSuppressAuthError } from "./auth-logger";

describe("auth logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("suppresses CredentialsSignin noise during E2E runs", () => {
    vi.stubEnv("E2E_MODE", "true");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new CredentialsSignin();

    expect(shouldSuppressAuthError(error)).toBe(true);

    logAuthError(error);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("logs CredentialsSignin outside E2E runs", () => {
    vi.stubEnv("E2E_MODE", "false");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new CredentialsSignin();

    expect(shouldSuppressAuthError(error)).toBe(false);
    expect(formatAuthError(error)).toContain("CredentialsSignin");

    logAuthError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[auth][error] CredentialsSignin: Read more at https://errors.authjs.dev#credentialssignin"
    );
  });

  it("keeps non-auth errors visible during E2E runs", () => {
    vi.stubEnv("E2E_MODE", "true");
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("boom");

    expect(shouldSuppressAuthError(error)).toBe(false);
    expect(formatAuthError(error)).toBe("[auth][error] Error: boom");

    logAuthError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith("[auth][error] Error: boom");
  });
});
