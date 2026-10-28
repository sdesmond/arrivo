export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_BCRYPT_COST = 10;

/** Shared new-password rules (sign-up, setup completion). Returns the user-facing error, or undefined when valid. */
export function validateNewPassword(password: string, confirmation: string): string | undefined {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!confirmation) return "Confirm your password.";
  if (password !== confirmation) return "Passwords do not match.";
  return undefined;
}

/** The form field a `validateNewPassword` error belongs to. */
export function failedPasswordField(password: string): "password" | "confirmPassword" {
  if (password.length < PASSWORD_MIN_LENGTH) return "password";
  return "confirmPassword";
}
