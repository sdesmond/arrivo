import { expect, it } from "vitest";
import { ConfirmationRequiredError } from "./confirmation-required-error";

it("is a named Error carrying its message, with no transport status", () => {
  const error = new ConfirmationRequiredError("Confirm to remove this day.");
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("ConfirmationRequiredError");
  expect(error.message).toBe("Confirm to remove this day.");
  expect(error).not.toHaveProperty("status");
});

it("carries the confirmation the caller must echo back", () => {
  const confirmation = { removedDates: ["2026-08-02"] };
  expect(new ConfirmationRequiredError("Confirm.", confirmation).confirmation).toBe(confirmation);
  expect(new ConfirmationRequiredError("Confirm.").confirmation).toBeUndefined();
});
