/** A request that clashes with stored state (reused ID or key); the transport layer maps it to its own conflict status. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
