// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { decryptField, isEncryptedField } from "@/lib/field-encryption";

const TEST_KEY = randomBytes(32).toString("base64");
vi.stubEnv("DATA_ENCRYPTION_KEY", TEST_KEY);

const { mockReturning, mockWhere, mockSet, mockUpdate, mockRequireUser, mockTransaction, mockRevalidatePath } =
  vi.hoisted(() => {
    const mockReturning = vi.fn().mockResolvedValue([{ id: "companion-1" }]);
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });
    const mockRequireUser = vi.fn().mockResolvedValue({ id: "user-1" });
    const mockTransaction = vi.fn();
    const mockRevalidatePath = vi.fn();
    return { mockReturning, mockWhere, mockSet, mockUpdate, mockRequireUser, mockTransaction, mockRevalidatePath };
  });

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: mockRequireUser,
}));

vi.mock("@/db", () => ({
  db: {
    update: mockUpdate,
    transaction: mockTransaction,
    select: vi.fn(() => ({ from: () => ({ where: mockSelectWhere }) })),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/db/schema", () => ({
  users: { tableName: "users" },
  collaborators: { tableName: "collaborators" },
  trips: { tableName: "trips" },
  documents: { tableName: "documents" },
  invitations: { tableName: "invitations" },
  userLoyaltyNumbers: {},
  userWishlistDestinations: {},
  userCompanions: {},
}));

// Conditions come back as plain tuples so tests can assert which rows a statement targeted.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_column: unknown, value: unknown) => ["eq", value]),
  and: vi.fn((...conditions: unknown[]) => ["and", ...conditions]),
  inArray: vi.fn((_column: unknown, values: unknown) => ["inArray", values]),
  sql: vi.fn(),
}));

const { mockStorageDel, mockPublishTripEvent, mockPublishUserEvent, mockPurgeTripTopic, mockPublishInvitationChanged } =
  vi.hoisted(() => ({
    mockStorageDel: vi.fn(),
    mockPublishTripEvent: vi.fn(),
    mockPublishUserEvent: vi.fn(),
    mockPurgeTripTopic: vi.fn(),
    mockPublishInvitationChanged: vi.fn(),
  }));

vi.mock("@/lib/storage/storage-adapter", () => ({
  getStorageAdapter: () => ({ del: mockStorageDel }),
}));

vi.mock("@/lib/trip-events", () => ({
  publishTripEvent: mockPublishTripEvent,
  publishUserEvent: mockPublishUserEvent,
  purgeTripTopic: mockPurgeTripTopic,
}));

vi.mock("@/lib/invitations", () => ({
  publishInvitationChanged: mockPublishInvitationChanged,
}));

const { mockSignOut, mockSelectWhere, mockCheckThrottle, mockRecordFailure, mockClearFailures, mockBump } = vi.hoisted(
  () => ({
    mockSignOut: vi.fn(),
    mockSelectWhere: vi.fn(),
    mockCheckThrottle: vi.fn(),
    mockRecordFailure: vi.fn(),
    mockClearFailures: vi.fn(),
    mockBump: vi.fn(),
  })
);

vi.mock("@/auth", () => ({
  signOut: mockSignOut,
}));

vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

vi.mock("@/lib/auth-throttle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-throttle")>()),
  checkThrottle: mockCheckThrottle,
  recordFailure: mockRecordFailure,
  clearFailures: mockClearFailures,
}));

vi.mock("@/lib/session-version", () => ({ bumpSessionVersion: mockBump }));

const { mockDeleteOwnAccount } = vi.hoisted(() => ({ mockDeleteOwnAccount: vi.fn() }));
vi.mock("@/lib/account-deletion", () => ({ deleteOwnAccount: mockDeleteOwnAccount }));

import bcrypt from "bcryptjs";
import { changePassword, deleteAccount } from "./actions";
import { AccountDeletionFailure, LiveSyncEventType, TripDeletionAction } from "@/data/types";
import type { DeletedAccountSummary } from "@/data/types";
import { addCompanion, addLoyaltyNumber, addWishlistDestination, updateProfile, updateCompanion } from "./actions";

interface RecordedInsert {
  table: unknown;
  values: unknown;
}

function createTransactionMock(selectResults: unknown[][]) {
  const recordedInserts: RecordedInsert[] = [];
  let selectIndex = 0;

  const transaction = {
    execute: vi.fn().mockResolvedValue([{ id: "user-1" }]),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: unknown) => {
        recordedInserts.push({ table, values });
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => selectResults[selectIndex++] ?? []),
      })),
    })),
  };

  return { recordedInserts, transaction };
}

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

  it("normalizes and writes a valid username", async () => {
    const result = await updateProfile({ username: "  Alice.W " });
    expect(result).toEqual({});
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ username: "alice.w" }));
  });

  it("returns the validation error for an invalid username without writing", async () => {
    const result = await updateProfile({ username: "al" });
    expect(result).toEqual({ error: "Username must be 3–30 characters." });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("reports a taken username", async () => {
    mockWhere.mockRejectedValueOnce(new Error("Failed query", { cause: { code: "23505" } }));
    const result = await updateProfile({ username: "bob" });
    expect(result).toEqual({ error: "That username is taken." });
  });

  it("leaves the username alone when the patch omits it", async () => {
    await updateProfile({ name: "Alice" });
    expect(mockSet.mock.calls[0][0]).not.toHaveProperty("username");
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

  it("rejects an invalid transit mode", async () => {
    const result = await updateProfile({ transitMode: "flying" as "walk" });
    expect(result).toEqual({ error: "Invalid transit mode." });
  });

  it("accepts valid and cleared transit modes", async () => {
    expect(await updateProfile({ transitMode: "transit" })).toEqual({});
    expect(await updateProfile({ transitMode: null })).toEqual({});
  });

  it("rejects a non-positive or fractional walk threshold", async () => {
    expect(await updateProfile({ walkThresholdMeters: 0 })).toEqual({
      error: "Walk threshold must be a positive integer.",
    });
    expect(await updateProfile({ walkThresholdMeters: 100.5 })).toEqual({
      error: "Walk threshold must be a positive integer.",
    });
  });

  it("accepts positive integer and cleared walk thresholds", async () => {
    expect(await updateProfile({ walkThresholdMeters: 500 })).toEqual({});
    expect(await updateProfile({ walkThresholdMeters: 5000 })).toEqual({});
    expect(await updateProfile({ walkThresholdMeters: null })).toEqual({});
  });

  it("rejects a walk threshold over 5000 meters", async () => {
    const result = await updateProfile({ walkThresholdMeters: 5001 });
    expect(result).toEqual({ error: "Walk threshold must be 5000 meters or less." });
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

  it("rejects invalid defaultCoverType", async () => {
    const result = await updateProfile({ defaultCoverType: "invalid" as "photo" });
    expect(result).toEqual({ error: "Invalid cover type." });
  });

  it('accepts valid defaultCoverType "photo"', async () => {
    const result = await updateProfile({ defaultCoverType: "photo" });
    expect(result).toEqual({});
  });

  it('accepts valid defaultCoverType "map"', async () => {
    const result = await updateProfile({ defaultCoverType: "map" });
    expect(result).toEqual({});
  });

  it('accepts valid defaultCoverType "graphic"', async () => {
    const result = await updateProfile({ defaultCoverType: "graphic" });
    expect(result).toEqual({});
  });

  it("rejects warning threshold >= danger threshold", async () => {
    const result = await updateProfile({ warningThreshold: 90, dangerThreshold: 50 });
    expect(result).toEqual({ error: "Warning threshold must be less than danger threshold." });
  });

  it("rejects equal warning and danger thresholds", async () => {
    const result = await updateProfile({ warningThreshold: 80, dangerThreshold: 80 });
    expect(result).toEqual({ error: "Warning threshold must be less than danger threshold." });
  });

  it("rejects warning threshold out of range (negative)", async () => {
    const result = await updateProfile({ warningThreshold: -1 });
    expect(result).toEqual({ error: "Warning threshold must be between 0 and 100." });
  });

  it("rejects warning threshold out of range (over 100)", async () => {
    const result = await updateProfile({ warningThreshold: 101 });
    expect(result).toEqual({ error: "Warning threshold must be between 0 and 100." });
  });

  it("rejects danger threshold out of range (negative)", async () => {
    const result = await updateProfile({ dangerThreshold: -1 });
    expect(result).toEqual({ error: "Danger threshold must be between 0 and 100." });
  });

  it("rejects danger threshold out of range (over 100)", async () => {
    const result = await updateProfile({ dangerThreshold: 101 });
    expect(result).toEqual({ error: "Danger threshold must be between 0 and 100." });
  });

  it("accepts valid threshold pair", async () => {
    const result = await updateProfile({ warningThreshold: 50, dangerThreshold: 75 });
    expect(result).toEqual({});
  });

  it("threshold fields can be combined with other fields", async () => {
    const result = await updateProfile({ currency: "EUR", warningThreshold: 30 });
    expect(result).toEqual({});
  });

  it("existing field validation still works when thresholds present", async () => {
    const result = await updateProfile({ currency: "INVALID", warningThreshold: 50 });
    expect(result).toEqual({ error: "Currency must be a 3-letter ISO code." });
  });
});

describe("updateProfile — travel documents are encrypted at rest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue(undefined);
    mockRequireUser.mockResolvedValue({ id: "user-1" });
  });

  it("encrypts passport and known traveler numbers before writing", async () => {
    await updateProfile({ passportNumber: "X1234567", knownTravelerNumber: "TT-1", passportNationality: "US" });
    const written = mockSet.mock.calls[0][0];
    expect(isEncryptedField(written.passportNumber)).toBe(true);
    expect(decryptField(written.passportNumber)).toBe("X1234567");
    expect(isEncryptedField(written.knownTravelerNumber)).toBe(true);
    expect(decryptField(written.knownTravelerNumber)).toBe("TT-1");
    expect(written.passportNationality).toBe("US");
  });

  it("writes null when clearing travel documents", async () => {
    await updateProfile({ passportNumber: null, knownTravelerNumber: null });
    const written = mockSet.mock.calls[0][0];
    expect(written.passportNumber).toBeNull();
    expect(written.knownTravelerNumber).toBeNull();
  });

  it("leaves travel documents untouched when the patch omits them", async () => {
    await updateProfile({ name: "Alice" });
    const written = mockSet.mock.calls[0][0];
    expect("passportNumber" in written).toBe(false);
    expect("knownTravelerNumber" in written).toBe(false);
  });
});

describe("travel documents without DATA_ENCRYPTION_KEY", () => {
  const NEEDS_KEY = "Saving travel documents needs DATA_ENCRYPTION_KEY set on the server.";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([{ id: "companion-1" }]);
    mockRequireUser.mockResolvedValue({ id: "user-1" });
  });

  afterEach(() => vi.stubEnv("DATA_ENCRYPTION_KEY", TEST_KEY));

  it("refuses to save a passport number on the profile instead of failing", async () => {
    await expect(updateProfile({ passportNumber: "X1" })).resolves.toEqual({ error: NEEDS_KEY });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("refuses to save a companion's known traveler number instead of failing", async () => {
    await expect(updateCompanion("companion-1", { name: "Al", knownTravelerNumber: "K1" })).resolves.toEqual({
      error: NEEDS_KEY,
    });
  });

  it("still saves everything else, including clearing the fields", async () => {
    await expect(updateProfile({ name: "Alice", passportNumber: null })).resolves.toEqual({});
    await expect(updateCompanion("companion-1", { name: "Al" })).resolves.toEqual({});
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

  it("encrypts companion passport and known traveler numbers before writing", async () => {
    await updateCompanion("companion-1", { name: "Alice", passportNumber: "P1", knownTravelerNumber: "K1" });
    const written = mockSet.mock.calls[0][0];
    expect(decryptField(written.passportNumber)).toBe("P1");
    expect(isEncryptedField(written.passportNumber)).toBe(true);
    expect(decryptField(written.knownTravelerNumber)).toBe("K1");
    expect(isEncryptedField(written.knownTravelerNumber)).toBe(true);
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

describe("profile action transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
  });

  it("adds loyalty numbers inside a transaction and revalidates the profile route", async () => {
    const { recordedInserts, transaction } = createTransactionMock([[{ nextPos: 4 }]]);
    mockTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await addLoyaltyNumber({ programName: "SkyMiles", memberNumber: "12345" });

    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(recordedInserts).toEqual([
      {
        table: expect.anything(),
        values: { userId: "user-1", programName: "SkyMiles", memberNumber: "12345", position: 4 },
      },
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("adds wishlist destinations inside a transaction and revalidates the profile route", async () => {
    const { recordedInserts, transaction } = createTransactionMock([[{ nextPos: 2 }]]);
    mockTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    await addWishlistDestination({ name: "Kyoto" });

    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(recordedInserts).toEqual([
      {
        table: expect.anything(),
        values: { userId: "user-1", name: "Kyoto", position: 2 },
      },
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("adds companions inside a transaction and returns success", async () => {
    const { recordedInserts, transaction } = createTransactionMock([[{ count: 3 }], [{ nextPos: 7 }]]);
    mockTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await addCompanion({ name: "Alice", age: 29 });

    expect(result).toEqual({});
    expect(transaction.execute).toHaveBeenCalledOnce();
    expect(recordedInserts).toEqual([
      {
        table: expect.anything(),
        values: { userId: "user-1", name: "Alice", age: 29, position: 7 },
      },
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("returns the companion cap error when the transaction detects 20 existing rows", async () => {
    const { transaction } = createTransactionMock([[{ count: 20 }]]);
    mockTransaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction)
    );

    const result = await addCompanion({ name: "Alice" });

    expect(result).toEqual({ error: "Companion limit reached (20 maximum)." });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe("changePassword — throttling and session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue(undefined);
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockSelectWhere.mockResolvedValue([{ passwordHash: "hash" }]);
    mockCheckThrottle.mockResolvedValue({ locked: false });
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("new-hash" as never);
  });

  it("updates the hash, signs out every device and sends the user to sign in again", async () => {
    await expect(changePassword({ currentPassword: "old", newPassword: "new-password" })).resolves.toEqual({});
    expect(mockSet).toHaveBeenCalledWith({ passwordHash: "new-hash" });
    expect(mockBump).toHaveBeenCalledWith("user-1");
    expect(mockClearFailures).toHaveBeenCalledWith([expect.objectContaining({ key: "pwchange:user-1" })]);
    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/sign-in?notice=password-changed" });
  });

  it("records a failure when the current password is wrong", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    await expect(changePassword({ currentPassword: "bad", newPassword: "new-password" })).resolves.toEqual({
      error: "Current password is incorrect.",
    });
    expect(mockRecordFailure).toHaveBeenCalledWith([expect.objectContaining({ key: "pwchange:user-1" })]);
    expect(mockBump).not.toHaveBeenCalled();
  });

  it("refuses to check the password while locked out", async () => {
    mockCheckThrottle.mockResolvedValue({ locked: true, retryAfterSeconds: 900 });
    await expect(changePassword({ currentPassword: "old", newPassword: "new-password" })).resolves.toEqual({
      error: "Too many attempts. Try again in 15 minutes.",
    });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it("does not revoke sessions when the update fails", async () => {
    mockWhere.mockRejectedValueOnce(new Error("db down"));
    await expect(changePassword({ currentPassword: "old", newPassword: "new-password" })).resolves.toEqual({
      error: "Something went wrong.",
    });
    expect(mockBump).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

const SUMMARY: DeletedAccountSummary = {
  rescindedInvitations: [{ inviteeId: "user-grace", tripId: "trip-shared" }],
  transferredTrips: [["trip-transferred", "user-ada"]],
  deletedTripIds: ["trip-solo"],
  deletedTripMembers: [{ tripId: "trip-solo", userId: "user-bo" }],
  remainingTripIds: ["trip-transferred", "trip-transferred"],
  storageUrls: ["/api/storage/docs/ticket.pdf", "/api/storage/covers/porto.jpg"],
};

describe("deleteAccount — adapter around deleteOwnAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "user-1" });
    mockStorageDel.mockResolvedValue(undefined);
    mockDeleteOwnAccount.mockResolvedValue({ ok: true, summary: SUMMARY });
  });

  it("deletes for the signed-in user with the given choices", async () => {
    const choices = [{ tripId: "trip-transferred", action: TripDeletionAction.Delete }] as const;

    await expect(deleteAccount([...choices])).resolves.toEqual({ status: "success" });

    expect(mockDeleteOwnAccount).toHaveBeenCalledWith(expect.anything(), "user-1", choices);
  });

  it("publishes events, cleans up files and signs out only after the deletion commits", async () => {
    await deleteAccount([]);

    expect(mockPublishInvitationChanged).toHaveBeenCalledWith("user-grace", "trip-shared");
    expect(mockPublishTripEvent).toHaveBeenCalledWith("trip-solo", {
      type: LiveSyncEventType.TripDeleted,
      tripId: "trip-solo",
    });
    expect(mockPublishUserEvent).toHaveBeenCalledWith("user-bo", {
      type: LiveSyncEventType.TripDeleted,
      tripId: "trip-solo",
    });
    expect(mockPurgeTripTopic).toHaveBeenCalledWith("trip-solo");
    // Duplicate memberships on one trip produce a single notification.
    expect(mockPublishTripEvent).toHaveBeenCalledWith("trip-transferred", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-transferred",
    });
    expect(
      mockPublishTripEvent.mock.calls.filter(([, event]) => event.type === LiveSyncEventType.MembershipChanged)
    ).toHaveLength(1);
    expect(mockPublishUserEvent).toHaveBeenCalledWith("user-ada", {
      type: LiveSyncEventType.MembershipChanged,
      tripId: "trip-transferred",
    });
    expect(mockStorageDel).toHaveBeenCalledTimes(2);
    expect(mockStorageDel).toHaveBeenCalledWith("/api/storage/docs/ticket.pdf");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips");
    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/sign-in" });
    expect(mockSignOut.mock.invocationCallOrder[0]).toBeGreaterThan(mockDeleteOwnAccount.mock.invocationCallOrder[0]);
  });

  it("does not fail the deletion when a file cleanup rejects", async () => {
    mockStorageDel.mockRejectedValue(new Error("disk gone"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(deleteAccount([])).resolves.toEqual({ status: "success" });

    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/sign-in" });
    warn.mockRestore();
  });

  it("returns stale without side effects when the choices changed", async () => {
    mockDeleteOwnAccount.mockResolvedValue({ ok: false, reason: AccountDeletionFailure.Stale });

    await expect(deleteAccount([])).resolves.toEqual({
      status: "error",
      message: "Your shared trips changed. Review them and try again.",
      stale: true,
    });

    expectNoSideEffects();
  });

  it("explains the refusal, without stale, when the user is the last completed admin", async () => {
    mockDeleteOwnAccount.mockResolvedValue({ ok: false, reason: AccountDeletionFailure.LastAdmin });

    await expect(deleteAccount([])).resolves.toEqual({
      status: "error",
      message: "You're the only admin with a finished account. Make another account an admin before deleting yours.",
    });

    expectNoSideEffects();
  });

  it("returns stale for a malformed choices payload without deleting", async () => {
    await expect(deleteAccount("everything" as unknown as Parameters<typeof deleteAccount>[0])).resolves.toEqual(
      expect.objectContaining({ stale: true })
    );
    expect(mockDeleteOwnAccount).not.toHaveBeenCalled();
  });

  it("skips cleanup, notifications and sign-out when the deletion fails", async () => {
    mockDeleteOwnAccount.mockRejectedValue(new Error("db down"));

    await expect(deleteAccount([])).rejects.toThrow("db down");

    expectNoSideEffects();
  });
});

function expectNoSideEffects() {
  expect(mockStorageDel).not.toHaveBeenCalled();
  expect(mockPublishTripEvent).not.toHaveBeenCalled();
  expect(mockPublishUserEvent).not.toHaveBeenCalled();
  expect(mockPublishInvitationChanged).not.toHaveBeenCalled();
  expect(mockSignOut).not.toHaveBeenCalled();
}
