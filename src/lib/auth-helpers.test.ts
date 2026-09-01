// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, db, mockNotFound } = vi.hoisted(() => ({
  auth: vi.fn(),
  db: { select: vi.fn() },
  mockNotFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/db", () => ({ db }));
vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  redirect: vi.fn(),
}));

import { assertTripAccess } from "./auth-helpers";

function mockCollaboratorRole(role: string | undefined) {
  db.select.mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(async () => (role ? [{ role }] : [])),
    })),
  });
}

describe("assertTripAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies a manager-gated action for a user whose role is editor", async () => {
    mockCollaboratorRole("editor");

    await expect(assertTripAccess("trip-1", "user-1", "manager")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("grants a viewer-gated action for a user whose role is manager", async () => {
    mockCollaboratorRole("manager");

    await expect(assertTripAccess("trip-1", "user-1", "viewer")).resolves.toBeUndefined();
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it("denies access for a user with an invalid legacy owner role", async () => {
    mockCollaboratorRole("owner");

    await expect(assertTripAccess("trip-1", "user-1", "viewer")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });
});
