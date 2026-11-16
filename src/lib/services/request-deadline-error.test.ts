import { expect, it } from "vitest";
import { RequestDeadlineError } from "./request-deadline-error";

it("is a named Error with a retry message and no transport status", () => {
  const error = new RequestDeadlineError();
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("RequestDeadlineError");
  expect(error.message).toBe("The server took too long to save this change. Try again.");
  expect(error).not.toHaveProperty("status");
});
