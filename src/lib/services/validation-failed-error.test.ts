import { expect, it } from "vitest";
import { ValidationFailedError } from "./validation-failed-error";

it("is a named Error carrying its message and optional fields, with no transport status", () => {
  const error = new ValidationFailedError("Too many days.");
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("ValidationFailedError");
  expect(error.message).toBe("Too many days.");
  expect(error.fields).toBeUndefined();
  expect(error).not.toHaveProperty("status");
  expect(new ValidationFailedError("Bad.", { days: ["Too many."] }).fields).toEqual({ days: ["Too many."] });
});
