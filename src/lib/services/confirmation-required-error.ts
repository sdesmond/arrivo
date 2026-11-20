/**
 * A request that needs the caller's explicit confirmation first; the transport layer maps it to its own status. The
 * optional `confirmation` is what the caller must echo back to confirm.
 */
export class ConfirmationRequiredError extends Error {
  constructor(
    message: string,
    readonly confirmation?: unknown
  ) {
    super(message);
    this.name = "ConfirmationRequiredError";
  }
}
