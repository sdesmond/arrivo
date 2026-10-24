const GENERIC_ERROR_MESSAGE = "An unexpected error occurred. Please try again.";
const SAFE_ERROR_PREFIXES = [
  "Invalid labelId",
  "Invalid listId",
  "Template name",
  "Item text",
  "Packing item name",
  "Packing item not found",
  "Cannot save",
  "Target item",
  "Failed to create",
  "Template not found",
  "Item not found",
] as const;

export function sanitizeError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(GENERIC_ERROR_MESSAGE);
  }

  if (SAFE_ERROR_PREFIXES.some((prefix) => error.message.startsWith(prefix))) {
    return error;
  }

  return new Error(GENERIC_ERROR_MESSAGE);
}

function isNextJsSignal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as Record<string, unknown>).digest === "string"
  );
}

export function withErrorHandling<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>
): (...args: Args) => Promise<Result> {
  return async (...args: Args): Promise<Result> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (isNextJsSignal(error)) {
        throw error;
      }

      throw sanitizeError(error);
    }
  };
}

const UNIQUE_VIOLATION_CODE = "23505";

function hasUniqueViolationCode(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === UNIQUE_VIOLATION_CODE;
}

// Postgres unique-constraint violation. Drizzle wraps driver errors in DrizzleQueryError, so the code sits on `cause`.
export function isUniqueViolation(error: unknown): boolean {
  if (hasUniqueViolationCode(error)) return true;
  return error instanceof Error && hasUniqueViolationCode(error.cause);
}
