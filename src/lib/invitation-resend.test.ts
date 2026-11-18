import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { applyInvitationResend } from "./invitation-resend";

describe("applyInvitationResend", () => {
  it("returns the expiry and invitee for an updated pending invitation", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "invitation", inviteeId: "invitee" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const executor = { update: () => ({ set: () => ({ where }) }) };
    await expect(
      applyInvitationResend(executor as never, "invitation", "trip", new Date("2030-01-01T00:00:00Z"))
    ).resolves.toEqual({ status: "success", inviteeId: "invitee", expiresAt: "2030-01-01T00:00:00.000Z" });
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toMatch(/"invitations"\."id" = \$1/);
    expect(query.sql).toMatch(/"invitations"\."trip_id" = \$2/);
    expect(query.sql).toMatch(/"invitations"\."status" = \$3/);
    expect(query.params).toEqual(["invitation", "trip", "pending"]);
  });
  it.each([
    [[], "Invitation not found."],
    [[{ id: "invitation", tripId: "other" }], "Invitation not found."],
    [[{ id: "invitation", tripId: "trip" }], "Invitation is no longer pending."],
  ])("diagnoses an unmatched invitation", async (rows, message) => {
    const executor = {
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
      select: () => ({ from: () => ({ where: async () => rows }) }),
    };
    await expect(applyInvitationResend(executor as never, "invitation", "trip", new Date())).resolves.toEqual({
      status: "error",
      message,
    });
  });
});
