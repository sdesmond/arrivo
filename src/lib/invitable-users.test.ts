// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));

const { mockDbSelect } = vi.hoisted(() => ({ mockDbSelect: vi.fn() }));

vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));

import { getInvitableUsers } from "@/lib/invitable-users";

const dialect = new PgDialect();

function mockQueries({ invitable, others }: { invitable: unknown[]; others: unknown[] }) {
  const orderBy = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => invitable);
  const invitableWhere = vi.fn<(condition: SQL) => { orderBy: typeof orderBy }>(() => ({ orderBy }));
  const limit = vi.fn<(count: number) => Promise<unknown[]>>(async () => others);
  const othersWhere = vi.fn<(condition: SQL) => { limit: typeof limit }>(() => ({ limit }));
  mockDbSelect
    .mockReturnValueOnce({ from: () => ({ where: invitableWhere }) })
    .mockReturnValueOnce({ from: () => ({ where: othersWhere }) });
  return { invitableWhere, orderBy, othersWhere, limit };
}

describe("getInvitableUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the invitable usernames and reports other accounts exist", async () => {
    mockQueries({
      invitable: [
        { id: "user-2", username: "alice" },
        { id: "user-3", username: "bob" },
      ],
      others: [{ id: "user-2" }],
    });

    await expect(getInvitableUsers("trip-1", "user-1")).resolves.toEqual({
      users: [
        { id: "user-2", username: "alice" },
        { id: "user-3", username: "bob" },
      ],
      hasOtherUsers: true,
    });
  });

  it("filters to password-set accounts outside the caller, collaborators and pending invitees", async () => {
    const { invitableWhere } = mockQueries({ invitable: [], others: [] });

    await getInvitableUsers("trip-1", "user-1");

    const { sql: text, params } = dialect.sqlToQuery(invitableWhere.mock.calls[0]![0]);
    expect(text).toContain('"users"."id" <> $');
    expect(text).toContain('"users"."password_hash" is not null');
    expect(text).toContain('not exists (select 1 from "collaborators" where "collaborators"."trip_id" = $');
    expect(text).toContain('and "collaborators"."user_id" = "users"."id")');
    expect(text).toContain('and "invitations"."invitee_id" = "users"."id"');
    expect(text).toContain('not exists (select 1 from "invitations"');
    expect(text).toContain('"invitations"."status" = \'pending\'');
    expect(params).toContain("user-1");
    expect(params).toContain("trip-1");
  });

  it("sorts case-insensitively by username", async () => {
    const { orderBy } = mockQueries({ invitable: [], others: [] });

    await getInvitableUsers("trip-1", "user-1");

    const [ordering] = orderBy.mock.calls[0]!;
    expect(dialect.sqlToQuery(ordering as SQL).sql).toBe('lower("users"."username") asc');
  });

  it("reports no other users when the caller is the only account", async () => {
    const { othersWhere, limit } = mockQueries({ invitable: [], others: [] });

    await expect(getInvitableUsers("trip-1", "user-1")).resolves.toEqual({ users: [], hasOtherUsers: false });

    const { sql: text, params } = dialect.sqlToQuery(othersWhere.mock.calls[0]![0]);
    expect(text).toBe('"users"."id" <> $1');
    expect(params).toEqual(["user-1"]);
    expect(limit).toHaveBeenCalledWith(1);
  });

  it("distinguishes other accounts that are all already involved from a sole user", async () => {
    mockQueries({ invitable: [], others: [{ id: "user-2" }] });

    await expect(getInvitableUsers("trip-1", "user-1")).resolves.toEqual({ users: [], hasOtherUsers: true });
  });
});
