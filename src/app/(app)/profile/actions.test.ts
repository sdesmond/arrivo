import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockReturning, mockWhere, mockSet, mockUpdate, mockRequireUser } = vi.hoisted(() => {
  const mockReturning = vi.fn().mockResolvedValue([{ id: "companion-1" }]);
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
  const mockRequireUser = vi.fn().mockResolvedValue({ id: "user-1" });
  return { mockReturning, mockWhere, mockSet, mockUpdate, mockRequireUser };
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

import { updateProfile, updateCompanion } from "./actions";

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

  it("trims name before validating length", async () => {
    // 100 x's surrounded by spaces → trimmed length is 100, should pass
    const result = await updateProfile({ name: "  " + "x".repeat(100) + "  " });
    expect(result).toEqual({});
  });

  it("returns {} when name is empty string (normalizes to null)", async () => {
    const result = await updateProfile({ name: "" });
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

  it("returns {} when passportExpiry is a valid YYYY-MM-DD date", async () => {
    const result = await updateProfile({ passportExpiry: "2028-06-15" });
    expect(result).toEqual({});
  });

  it("returns error when passportExpiry is not in YYYY-MM-DD format", async () => {
    const result = await updateProfile({ passportExpiry: "06/15/2028" });
    expect(result).toEqual({ error: "Passport expiry must be a valid date (YYYY-MM-DD)." });
  });

  it("returns error when passportExpiry is a free-form string", async () => {
    const result = await updateProfile({ passportExpiry: "not-a-date" });
    expect(result).toEqual({ error: "Passport expiry must be a valid date (YYYY-MM-DD)." });
  });

  it("returns error when db.update throws", async () => {
    mockWhere.mockRejectedValue(new Error("connection lost"));
    const result = await updateProfile({ name: "Alice" });
    expect(result).toEqual({ error: "Something went wrong." });
  });
});

describe("updateCompanion — passportExpiry validation, zero-row detection, exception safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([{ id: "companion-1" }]);
    mockRequireUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns {} on successful update", async () => {
    const result = await updateCompanion("companion-1", { name: "Alice" });
    expect(result).toEqual({});
  });

  it("returns {} when passportExpiry is a valid YYYY-MM-DD date", async () => {
    const result = await updateCompanion("companion-1", { passportExpiry: "2030-01-01" });
    expect(result).toEqual({});
  });

  it("returns error when passportExpiry is not in YYYY-MM-DD format", async () => {
    const result = await updateCompanion("companion-1", { passportExpiry: "01/01/2030" });
    expect(result).toEqual({ error: "Passport expiry must be a valid date (YYYY-MM-DD)." });
  });

  it("returns error when passportExpiry is a free-form string", async () => {
    const result = await updateCompanion("companion-1", { passportExpiry: "next year" });
    expect(result).toEqual({ error: "Passport expiry must be a valid date (YYYY-MM-DD)." });
  });

  it("returns not-found error when update affects zero rows", async () => {
    mockReturning.mockResolvedValue([]);
    const result = await updateCompanion("unknown-id", { name: "Alice" });
    expect(result).toEqual({ error: "Companion not found." });
  });

  it("returns error when db.update throws", async () => {
    mockReturning.mockRejectedValue(new Error("constraint violation"));
    const result = await updateCompanion("companion-1", { name: "Alice" });
    expect(result).toEqual({ error: "Something went wrong." });
  });

  it("returns error when companion name is empty", async () => {
    const result = await updateCompanion("companion-1", { name: "" });
    expect(result).toEqual({ error: "Companion name is required." });
  });

  it("returns error when companion name exceeds 50 chars", async () => {
    const result = await updateCompanion("companion-1", { name: "x".repeat(51) });
    expect(result).toEqual({ error: "Companion name must be 50 characters or fewer." });
  });
});
