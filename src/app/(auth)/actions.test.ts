// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { headers } from "next/headers";

const { signIn, signOut, db } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  db: {
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  signIn,
  signOut,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("next-auth", () => ({
  AuthError: class AuthError extends Error {},
}));

import { collaborators, users } from "@/db/schema";
import { signOutAction, signUpAction } from "./actions";

describe("auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(headers).mockResolvedValue(new Headers());
  });

  it("stores a locale-derived currency when signing up", async () => {
    vi.mocked(headers).mockResolvedValueOnce(new Headers({ "accept-language": "en-GB,en;q=0.9" }));
    const insertValues = vi.fn();

    db.insert.mockImplementation((table: unknown) => {
      if (table === users) {
        return {
          values: insertValues.mockImplementation((values: unknown) => ({
            onConflictDoNothing: () => ({
              returning: async () => [{ id: "user-1", ...(values as Record<string, unknown>) }],
            }),
          })),
        };
      }

      throw new Error("Unexpected insert");
    });
    db.update.mockImplementation((table: unknown) => {
      if (table !== collaborators) throw new Error("Unexpected update");
      return {
        set: () => ({
          where: async () => undefined,
        }),
      };
    });

    const formData = new FormData();
    formData.set("email", "test@example.com");
    formData.set("password", "password123");
    formData.set("name", "Test User");

    await expect(signUpAction(undefined, formData)).resolves.toBeUndefined();

    expect(db.insert).toHaveBeenCalledWith(users);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        name: "Test User",
        currency: "GBP",
      })
    );
    expect(signIn).toHaveBeenCalled();
  });

  it("signs out to the sign-in page", async () => {
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/sign-in" });
  });
});
