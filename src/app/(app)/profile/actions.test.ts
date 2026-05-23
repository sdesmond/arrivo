import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockWhere, mockSet, mockUpdate, mockRequireUser } = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
  const mockRequireUser = vi.fn().mockResolvedValue({ id: "user-1" });
  return { mockWhere, mockSet, mockUpdate, mockRequireUser };
});

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("@/db", () => ({
  db: { update: mockUpdate },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  users: {},
  collaborators: {},
  trips: {},
  userLoyaltyNumbers: {},
  userWishlistDestinations: {},
  userCompanions: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  not: vi.fn(),
  exists: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/auth", () => ({
  signOut: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

import { updateProfile } from "./actions";

describe("updateProfile — server-side validation (AC10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue(undefined);
    mockRequireUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns error when name exceeds 100 chars", async () => {
    const result = await updateProfile({ name: "x".repeat(101) });
    expect(result).toEqual({ error: "Name must be 100 characters or fewer." });
  });

  it("returns {} when name is exactly 100 chars", async () => {
    const result = await updateProfile({ name: "x".repeat(100) });
    expect(result).toEqual({});
  });

  it("returns error when passportNumber exceeds 20 chars", async () => {
    const result = await updateProfile({ passportNumber: "A".repeat(21) });
    expect(result).toEqual({ error: "Passport number must be 20 characters or fewer." });
  });

  it("returns error when passportNationality exceeds 50 chars", async () => {
    const result = await updateProfile({ passportNationality: "A".repeat(51) });
    expect(result).toEqual({ error: "Nationality must be 50 characters or fewer." });
  });

  it("returns error when knownTravelerNumber exceeds 20 chars", async () => {
    const result = await updateProfile({ knownTravelerNumber: "A".repeat(21) });
    expect(result).toEqual({ error: "Known traveler number must be 20 characters or fewer." });
  });

  it("returns error when currency is non-empty and not 3 uppercase letters", async () => {
    const result = await updateProfile({ currency: "US" });
    expect(result).toEqual({ error: "Currency must be a 3-letter ISO code." });
  });

  it("returns {} when currency is empty string (optional field)", async () => {
    const result = await updateProfile({ currency: "" });
    expect(result).toEqual({});
  });

  it("returns {} when currency is valid 3-letter code", async () => {
    const result = await updateProfile({ currency: "USD" });
    expect(result).toEqual({});
  });

  it("returns error for invalid dateFormat", async () => {
    const result = await updateProfile({ dateFormat: "YYYY-MM-DD" as "MM/DD/YYYY" });
    expect(result).toEqual({ error: "Invalid date format." });
  });

  it("returns error for invalid distanceUnit", async () => {
    const result = await updateProfile({ distanceUnit: "km" as "metric" });
    expect(result).toEqual({ error: "Invalid distance unit." });
  });

  it("returns {} for valid patch with multiple fields", async () => {
    const result = await updateProfile({ name: "Alice", currency: "EUR" });
    expect(result).toEqual({});
  });

  it("returns {} when passportNumber is null (clearing the field)", async () => {
    const result = await updateProfile({ passportNumber: null });
    expect(result).toEqual({});
  });

  it("returns {} when passportNationality is null (clearing the field)", async () => {
    const result = await updateProfile({ passportNationality: null });
    expect(result).toEqual({});
  });

  it("returns {} when knownTravelerNumber is null (clearing the field)", async () => {
    const result = await updateProfile({ knownTravelerNumber: null });
    expect(result).toEqual({});
  });
});
