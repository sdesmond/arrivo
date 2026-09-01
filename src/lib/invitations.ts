export const INVITE_TTL_HOURS = 72;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
