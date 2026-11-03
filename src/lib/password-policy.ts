import {
  DEFAULT_PASSWORD_POLICY,
  PASSWORD_POLICY_BOUNDS,
  type PasswordPolicy,
  type PasswordPolicyField,
} from "@/data/types";

// Browser-safe on purpose: the same evaluator drives the live checklist and the server-side validation.

export const PASSWORD_BCRYPT_COST = 10;
/** bcrypt ignores everything past 72 bytes, so a longer password would be silently weaker than it looks. */
export const PASSWORD_BCRYPT_MAX_BYTES = 72;

export interface PasswordCounts {
  /** Unicode code points, not UTF-16 units: an emoji counts once. */
  length: number;
  bytes: number;
  /** ASCII A-Z only. */
  uppercase: number;
  /** ASCII 0-9 only. */
  numbers: number;
  /** Unicode punctuation and symbols. Spaces are not special. */
  special: number;
}

const encoder = new TextEncoder();
const SPECIAL_CHARACTER = /^[\p{P}\p{S}]$/u;

/** Counts without normalizing, trimming or truncating: the password is exactly what was typed. */
export function countPassword(password: string): PasswordCounts {
  const counts: PasswordCounts = {
    length: 0,
    bytes: encoder.encode(password).length,
    uppercase: 0,
    numbers: 0,
    special: 0,
  };
  for (const character of password) {
    counts.length += 1;
    if (character >= "A" && character <= "Z") counts.uppercase += 1;
    else if (character >= "0" && character <= "9") counts.numbers += 1;
    else if (SPECIAL_CHARACTER.test(character)) counts.special += 1;
  }
  return counts;
}

export type PasswordRequirementId = "length" | "uppercase" | "number" | "special";

export interface PasswordRequirementDescription {
  id: PasswordRequirementId;
  label: string;
}

export interface PasswordRequirement extends PasswordRequirementDescription {
  met: boolean;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** The requirements that are in force, in display order. A class whose minimum is 0 is omitted entirely. */
export function describePasswordRequirements(policy: PasswordPolicy): PasswordRequirementDescription[] {
  const requirements: PasswordRequirementDescription[] = [
    { id: "length", label: `${policy.minLength} to ${policy.maxLength} characters` },
  ];
  if (policy.minUppercase > 0) {
    requirements.push({
      id: "uppercase",
      label: `At least ${plural(policy.minUppercase, "uppercase letter", "uppercase letters")}`,
    });
  }
  if (policy.minNumbers > 0) {
    requirements.push({ id: "number", label: `At least ${plural(policy.minNumbers, "number", "numbers")}` });
  }
  if (policy.minSpecial > 0) {
    requirements.push({
      id: "special",
      label: `At least ${plural(policy.minSpecial, "special character", "special characters")}`,
    });
  }
  return requirements;
}

/**
 * Requirement state for the live checklist. Empty input satisfies nothing, so a blank field never shows a check. The
 * length rule also covers bcrypt's byte capacity, since both are about how much password the field can hold.
 */
export function evaluatePasswordRequirements(password: string, policy: PasswordPolicy): PasswordRequirement[] {
  const counts = countPassword(password);
  const filled = password.length > 0;
  const met: Record<PasswordRequirementId, boolean> = {
    length:
      filled &&
      counts.length >= policy.minLength &&
      counts.length <= policy.maxLength &&
      counts.bytes <= PASSWORD_BCRYPT_MAX_BYTES,
    uppercase: filled && counts.uppercase >= policy.minUppercase,
    number: filled && counts.numbers >= policy.minNumbers,
    special: filled && counts.special >= policy.minSpecial,
  };
  return describePasswordRequirements(policy).map((requirement) => ({ ...requirement, met: met[requirement.id] }));
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** One sentence naming every active requirement, e.g. "8 to 20 characters, with at least 1 number". */
export function passwordRequirementsSentence(policy: PasswordPolicy): string {
  const [length, ...classes] = describePasswordRequirements(policy);
  const parts = classes.map((requirement) => requirement.label.toLowerCase());
  return parts.length === 0 ? length.label : `${length.label}, with ${joinWithAnd(parts)}`;
}

/** Shown when the stored rules cannot be read: the form refuses rather than guessing weaker rules. */
export const PASSWORD_POLICY_UNAVAILABLE_ERROR = "Password rules are unavailable right now. Try again in a moment.";

export const PASSWORD_TOO_MANY_BYTES_ERROR = `Password is too long to store securely (${PASSWORD_BCRYPT_MAX_BYTES} bytes maximum). Shorten it or use fewer non-ASCII characters.`;

/** The user-facing error for a password that breaks the policy, or undefined when it satisfies every requirement. */
export function validatePasswordAgainstPolicy(password: string, policy: PasswordPolicy): string | undefined {
  const requirements = evaluatePasswordRequirements(password, policy);
  if (requirements.every((requirement) => requirement.met)) return undefined;
  const counts = countPassword(password);
  const lengthInRange = counts.length >= policy.minLength && counts.length <= policy.maxLength;
  const classesMet = requirements.every((requirement) => requirement.id === "length" || requirement.met);
  if (lengthInRange && classesMet) return PASSWORD_TOO_MANY_BYTES_ERROR;
  return `Password must be ${passwordRequirementsSentence(policy)}.`;
}

/** Shared new-password rules. Returns the user-facing error, or undefined when valid. */
export function validateNewPassword(
  password: string,
  confirmation: string,
  policy: PasswordPolicy
): string | undefined {
  const policyError = validatePasswordAgainstPolicy(password, policy);
  if (policyError) return policyError;
  if (!confirmation) return "Confirm your password.";
  if (password !== confirmation) return "Passwords do not match.";
  return undefined;
}

/** The form field a `validateNewPassword` error belongs to. */
export function failedPasswordField(password: string, policy: PasswordPolicy): "password" | "confirmPassword" {
  if (validatePasswordAgainstPolicy(password, policy)) return "password";
  return "confirmPassword";
}

export type PasswordPolicyValidation =
  | { ok: true; policy: PasswordPolicy }
  | { ok: false; error: string; field?: PasswordPolicyField };

const POLICY_KEYS = Object.keys(DEFAULT_PASSWORD_POLICY) as PasswordPolicyField[];

function isWholeNumberIn(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= range.min && value <= range.max;
}

const CLASS_RULES = [
  { count: "minUppercase", name: "Uppercase" },
  { count: "minNumbers", name: "Number" },
  { count: "minSpecial", name: "Special character" },
] as const;

/**
 * Checks untrusted input (a server action argument or a database row) and returns a clean policy. Rejects instead of
 * clamping: an impossible policy must never be saved or silently reshaped into a weaker one.
 */
export function validatePasswordPolicy(value: unknown): PasswordPolicyValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "Password rules are missing or malformed." };
  }
  const input = value as Record<string, unknown>;
  const { minLength: minimum, maxLength: maximum, classMinimum } = PASSWORD_POLICY_BOUNDS;
  if (!isWholeNumberIn(input.minLength, minimum)) {
    return {
      ok: false,
      field: "minLength",
      error: `Minimum length must be a whole number from ${minimum.min} to ${minimum.max}.`,
    };
  }
  if (!isWholeNumberIn(input.maxLength, maximum)) {
    return {
      ok: false,
      field: "maxLength",
      error: `Maximum length must be a whole number from ${maximum.min} to ${maximum.max}.`,
    };
  }
  if (input.minLength > input.maxLength) {
    return { ok: false, field: "minLength", error: "Minimum length can't be greater than maximum length." };
  }
  let required = 0;
  for (const rule of CLASS_RULES) {
    if (!isWholeNumberIn(input[rule.count], classMinimum)) {
      return {
        ok: false,
        field: rule.count,
        error: `${rule.name} minimum must be a whole number from ${classMinimum.min} to ${classMinimum.max} (0 means not required).`,
      };
    }
    required += input[rule.count] as number;
  }
  if (required > input.maxLength) {
    return {
      ok: false,
      field: "maxLength",
      error: `Required characters add up to ${required}, more than the maximum length of ${input.maxLength}. Lower a minimum or raise the maximum length.`,
    };
  }
  const policy = Object.fromEntries(POLICY_KEYS.map((key) => [key, input[key]])) as unknown as PasswordPolicy;
  return { ok: true, policy };
}
