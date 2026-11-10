import { expect, it } from "vitest";
import { ConflictError } from "./conflict-error";

it("is a named Error carrying its message, with no transport status", () => {
  const error = new ConflictError("This ID was already used.");
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("ConflictError");
  expect(error.message).toBe("This ID was already used.");
  expect(error).not.toHaveProperty("status");
});
