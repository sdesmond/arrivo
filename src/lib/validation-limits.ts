// Single source of truth for input caps. Server actions validate against these and client forms read them
// for `maxLength`, so the two halves can't drift. Pure module: safe to import from client components.

export const FIELD_LIMITS = {
  tripName: 100,
  destination: 200,
  tripNotes: 5000,
  tag: 30,
  tagCount: 20,
  eventName: 200,
  locationName: 200,
  locationAddress: 300,
  confirmationCode: 64,
  serviceNumber: 64,
  provider: 200,
  reservationNotes: 5000,
  eventNote: 5000,
  dayLabel: 100,
  dayText: 300,
  noteTitle: 200,
  noteBody: 10000,
  itineraryNote: 5000,
  checklistTitle: 200,
  checklistItem: 300,
  documentName: 200,
  documentKind: 50,
  documentSize: 50,
  packingListName: 30,
  packingItemText: 30,
  templateName: 30,
  expenseNote: 500,
  profileName: 100,
  passportNumber: 20,
  passportNationality: 50,
  knownTravelerNumber: 20,
  companionName: 50,
  loyaltyProgram: 100,
  loyaltyNumber: 50,
  wishlistDestination: 100,
  countryCode: 2,
} as const;

export type FieldLimitKey = keyof typeof FIELD_LIMITS;

/** Postgres `numeric(12,2)` holds < 10^10; keep a round, human ceiling well inside it. */
export const MAX_BUDGET_TOTAL = 1_000_000_000;
/** Longest typed budget: the ceiling's digits plus ".xx". */
export const MAX_BUDGET_INPUT_LENGTH = String(MAX_BUDGET_TOTAL).length + 3;
export const MAX_EXPENSE_AMOUNT = 50000;
/** Longest password sign-in and delete-account re-entry accept; one value for the server checks and the inputs' `maxLength`. The username limit is `USERNAME_MAX_LENGTH`. */
export const SIGN_IN_PASSWORD_MAX_LENGTH = 30;
/** Most events one routing request may carry; a day holds far fewer, and each costs a Mapbox call. */
export const MAX_ROUTE_EVENTS = 100;
/** Unsplash itself caps `per_page` at 30. */
export const MAX_COVER_SEARCH_PAGE_SIZE = 30;
export const MAX_COVER_SEARCH_PAGE = 50;
export const MAX_COMPANIONS = 20;
export const MAX_COMPANION_AGE = 120;
export const MAX_WALK_THRESHOLD_METERS = 5000;
export const MAX_ITINERARY_POSITION = 10_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** `YYYY-MM-DD` that is a real calendar date (rejects `2026-99-99` and `2027-02-29`). */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day)
  );
}

/** ISO datetime that `new Date()` parses to a real instant. */
export function isValidIsoDateTime(value: string): boolean {
  if (!ISO_DATE_TIME_PATTERN.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

/** Client-side mirror of the server's expense amount rules; `amount` is NaN when the input can't be saved. */
export function validateExpenseAmountInput(rawAmount: string): { amount: number; error?: string } {
  const decimalPart = rawAmount.split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    return { amount: Number.NaN, error: "Amount must have at most 2 decimal places." };
  }

  const amount = Number.parseFloat(rawAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { amount: Number.NaN, error: "Amount must be greater than 0." };
  }

  if (amount > MAX_EXPENSE_AMOUNT) {
    return { amount, error: "Amount must be 50,000 or less." };
  }

  return { amount };
}

export function overLimitMessage(label: string, limit: number): string {
  return `${label} must be ${limit} characters or fewer.`;
}
