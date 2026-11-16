/** A write that could not commit before its request deadline was rolled back; the transport maps it to a retryable status. */
export class RequestDeadlineError extends Error {
  constructor() {
    super("The server took too long to save this change. Try again.");
    this.name = "RequestDeadlineError";
  }
}
