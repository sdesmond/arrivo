import { AuthError } from "@auth/core/errors";

const CREDENTIALS_SIGNIN_ERROR = "CredentialsSignin";

export function shouldSuppressAuthError(error: Error): boolean {
  return process.env.PACKT_E2E === "true" && error instanceof AuthError && error.type === CREDENTIALS_SIGNIN_ERROR;
}

export function formatAuthError(error: Error): string {
  const errorName = error instanceof AuthError ? error.type : error.name;
  return `[auth][error] ${errorName}: ${error.message}`;
}

export function logAuthError(error: Error): void {
  if (shouldSuppressAuthError(error)) {
    return;
  }

  console.error(formatAuthError(error));
}
