import { describe, expect, it, vi } from "vitest";
const { select } = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/db", () => ({ db: { select } }));
import { requireTripRole, TripForbiddenError, TripNotFoundError } from "./trip-access";
const tripId = "123e4567-e89b-12d3-a456-426614174000";
function roleResult(role?: string) {
  select.mockReturnValue({ from: () => ({ where: async () => (role ? [{ role }] : []) }) });
}
describe("requireTripRole", () => {
  it("conceals malformed IDs and missing memberships", async () => {
    await expect(requireTripRole("bad", "user")).rejects.toBeInstanceOf(TripNotFoundError);
    roleResult();
    await expect(requireTripRole(tripId, "user")).rejects.toBeInstanceOf(TripNotFoundError);
    roleResult("owner");
    await expect(requireTripRole(tripId, "user")).rejects.toBeInstanceOf(TripNotFoundError);
  });
  it("distinguishes insufficient membership", async () => {
    roleResult("viewer");
    await expect(requireTripRole(tripId, "user", "editor")).rejects.toMatchObject({ requiredRole: "editor" });
    await expect(requireTripRole(tripId, "user", "editor")).rejects.toBeInstanceOf(TripForbiddenError);
  });
  it.each(["viewer", "editor", "manager"])("returns actual role %s", async (role) => {
    roleResult(role);
    await expect(requireTripRole(tripId, "user")).resolves.toBe(role);
  });
});
