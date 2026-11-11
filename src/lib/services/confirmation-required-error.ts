/** A request that needs the caller's explicit confirmation first; the transport layer maps it to its own status. */
export class ConfirmationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfirmationRequiredError";
  }
}
