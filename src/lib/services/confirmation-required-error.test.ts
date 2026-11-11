import { expect, it } from "vitest";
import { ConfirmationRequiredError } from "./confirmation-required-error";

it("is a named Error carrying its message, with no transport status", () => {
  const error = new ConfirmationRequiredError("Confirm to remove this day.");
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("ConfirmationRequiredError");
  expect(error.message).toBe("Confirm to remove this day.");
  expect(error).not.toHaveProperty("status");
});
