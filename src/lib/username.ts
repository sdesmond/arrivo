// Usernames are the sign-in identifier and how people find each other to share trips. Stored lowercased; the
// database also enforces uniqueness on lower(username). Pure functions so client forms can validate inline.
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  const normalized = normalizeUsername(username);
  if (!normalized) return "Enter a username.";
  if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return "Use letters, numbers, dots, dashes or underscores, starting with a letter or number.";
  }
  return null;
}
