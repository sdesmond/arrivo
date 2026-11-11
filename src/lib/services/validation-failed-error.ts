/** Input that is well formed but breaks a business limit; the transport layer maps it to its own validation status. */
export class ValidationFailedError extends Error {
  constructor(
    message: string,
    readonly fields?: Record<string, string[]>
  ) {
    super(message);
    this.name = "ValidationFailedError";
  }
}
