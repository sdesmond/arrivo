import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/invitations";

describe("normalizeEmail", () => {
  it("trims surrounding whitespace and lowercases email addresses", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM  ")).toBe("foo.bar@example.com");
  });
});
