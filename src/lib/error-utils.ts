const GENERIC_ERROR_MESSAGE = "An unexpected error occurred. Please try again.";
const SAFE_ERROR_PREFIXES = [
  "Invalid labelId",
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

      throw sanitizeError(error);
    }
  };
}
