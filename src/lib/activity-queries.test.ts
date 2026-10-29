// @vitest-environment node
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isAppAdmin: vi.fn() }));
vi.mock("./app-roles", () => ({ isAppAdmin: mocks.isAppAdmin }));

import {
  ACTIVITY_ACTOR_LIMIT,
  ACTIVITY_PAGE_SIZE,
  decodeActivityCursor,
  encodeActivityCursor,
  readActivityPage,
  type ActivityReadDatabase,
} from "./activity-queries";

const dialect = new PgDialect();
const NOW = new Date("2026-10-26T12:00:00.000Z");
const ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

const ROW = {
  id: ID,
  type: "sign_in",
  actorUsername: "alice" as string | null,
  startedAt: new Date("2026-10-25T12:00:00.000Z"),
  endedAt: new Date("2026-10-25T12:00:00.000Z"),
  tripId: null as string | null,
  targetId: null as string | null,
  targetUsername: null as string | null,
};

let eventRows: (typeof ROW)[] = [];
let actorRows: { id: string; username: string }[] = [];
let eventWhere: SQL | undefined;
let eventLimit: number | undefined;
let actorLimit: number | undefined;
let selectCalls = 0;

const database = {
  select: () => {
    selectCalls += 1;
    // The actor options are read first, then the page.
    const isActorQuery = selectCalls % 2 === 1;
    return {
      from: () => ({
        where: (condition: SQL) => {
          if (!isActorQuery) eventWhere = condition;
          return {
            groupBy: () => ({
              orderBy: () => ({
                limit: async (limit: number) => {
                  actorLimit = limit;
                  return actorRows;
                },
              }),
            }),
            orderBy: () => ({
              limit: async (limit: number) => {
                eventLimit = limit;
                return eventRows;
              },
            }),
          };
        },
      }),
    };
  },
} as unknown as ActivityReadDatabase;

async function read(query = {}, viewer = "admin-1") {
  const result = await readActivityPage(database, viewer, query, NOW);
  if (result.status !== "ok") throw new Error("expected ok");
  return result;
}

const whereText = () => dialect.sqlToQuery(eventWhere!);

describe("readActivityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCalls = 0;
    eventWhere = undefined;
    eventLimit = undefined;
    actorLimit = undefined;
    eventRows = [ROW];
    actorRows = [{ id: ACTOR_ID, username: "alice" }];
    mocks.isAppAdmin.mockResolvedValue(true);
  });

  it("rechecks current admin authority and reads nothing for anyone else", async () => {
    mocks.isAppAdmin.mockResolvedValue(false);
    await expect(readActivityPage(database, "member-1", {}, NOW)).resolves.toEqual({ status: "forbidden" });
    expect(mocks.isAppAdmin).toHaveBeenCalledWith("member-1");
    expect(selectCalls).toBe(0);
  });

  it("returns the safe summary shape, actor options and the read time", async () => {
    const page = await read();
    expect(eventLimit).toBe(ACTIVITY_PAGE_SIZE + 1);
    expect(actorLimit).toBe(ACTIVITY_ACTOR_LIMIT);
    expect(page).toEqual({
      status: "ok",
      events: [{ id: ID, type: "sign_in", actorUsername: "alice", occurredAt: "2026-10-25T12:00:00.000Z" }],
      actors: [{ id: ACTOR_ID, username: "alice" }],
      loadedAt: NOW.toISOString(),
    });
    expect(page.nextCursor).toBeUndefined();
  });

  it("exposes a known target's username but never its ID, and keeps trip ids", async () => {
    eventRows = [
      { ...ROW, type: "role_changed", targetId: "user-2", targetUsername: "bob", tripId: "trip-1" },
      { ...ROW, id: "e2", type: "sign_in_failed", actorUsername: null, targetUsername: "ghost" },
      { ...ROW, id: "e3", type: "sign_in_failed", actorUsername: null },
    ];
    const { events } = await read();
    expect(events[0]).toMatchObject({ targetUsername: "bob", targetKnown: true, tripId: "trip-1" });
    expect(events[1]).toMatchObject({ actorUsername: null, targetUsername: "ghost", targetKnown: false });
    expect(events[2]).not.toHaveProperty("targetUsername");
    expect(events[2]).not.toHaveProperty("tripId");
    expect(JSON.stringify(events)).not.toContain("user-2");
  });

  it("gives batched rows a start and an ongoing flag from the real clock", async () => {
    const recent = new Date(NOW.getTime() - 9 * 60_000);
    const old = new Date(NOW.getTime() - 10 * 60_000);
    eventRows = [
      { ...ROW, id: "a", type: "trip_updated", startedAt: new Date(NOW.getTime() - 20 * 60_000), endedAt: recent },
      { ...ROW, id: "b", type: "trip_updated", startedAt: old, endedAt: old },
      { ...ROW, id: "c", type: "sign_in", endedAt: recent },
    ];
    const { events } = await read();
    expect(events[0]).toMatchObject({ startedAt: "2026-10-26T11:40:00.000Z", ongoing: true });
    expect(events[1]).toMatchObject({ ongoing: false });
    expect(events[2]).not.toHaveProperty("ongoing");
    expect(events[2]).not.toHaveProperty("startedAt");
  });

  it("offers a cursor for the last shown row only when an older row exists", async () => {
    eventRows = Array.from({ length: ACTIVITY_PAGE_SIZE + 1 }, (_, index) => ({
      ...ROW,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    const page = await read();
    expect(page.events).toHaveLength(ACTIVITY_PAGE_SIZE);
    const last = page.events[ACTIVITY_PAGE_SIZE - 1];
    expect(decodeActivityCursor(page.nextCursor)).toEqual({ endedAt: ROW.endedAt, id: last.id });
  });

  it("keys the next page on endedAt then id", async () => {
    const cursor = encodeActivityCursor(new Date("2026-10-25T12:00:00.000Z"), ID);
    await read({ cursor });
    const { sql: text, params } = whereText();
    expect(text).toContain('"ended_at" < $');
    expect(text).toContain('"ended_at" = $');
    expect(text).toContain('"id" < $');
    expect(params).toContain(ID);
  });

  it("reads the first page for a malformed cursor", async () => {
    for (const cursor of ["not-a-cursor", Buffer.from("2026-10-25|x").toString("base64url"), "a|b|c"]) {
      await read({ cursor });
      expect(whereText().sql).not.toContain('"ended_at" <');
    }
  });

  it("filters on actor and action when given", async () => {
    await read({ actorId: ACTOR_ID, type: "trip_updated" });
    const { sql: text, params } = whereText();
    expect(text).toContain('"actor_id" = $');
    expect(params).toContain(ACTOR_ID);
    expect(params).toContain("trip_updated");
  });

  it("ignores an unknown action as no filter", async () => {
    await read({ type: "mystery" as never });
    expect(whereText().params).not.toContain("mystery");
  });

  it("matches nothing for a malformed actor ID without querying events", async () => {
    const page = await read({ actorId: "not-a-uuid" });
    expect(page.events).toEqual([]);
    expect(eventLimit).toBeUndefined();
  });

  it("selects intervals overlapping the range, inclusive at both ends", async () => {
    await read({ from: "2026-10-26T10:00:00.000Z", to: "2026-10-26T11:00:00.000Z" });
    const { sql: text, params } = whereText();
    expect(text).toContain('"ended_at" >= $');
    expect(text).toContain('"started_at" <= $');
    expect(params.map(String).some((param) => param.includes("2026-10-26T10:00:00.000Z"))).toBe(true);
  });

  it("returns no rows and flags an inverted or unreadable range", async () => {
    for (const query of [
      { from: "2026-10-27T00:00:00.000Z", to: "2026-10-26T00:00:00.000Z" },
      { from: "garbage" },
      { to: "garbage" },
    ]) {
      const page = await read(query);
      expect(page).toMatchObject({ events: [], invalidRange: true });
    }
    expect(eventLimit).toBeUndefined();
  });

  it("accepts a single-ended or empty range", async () => {
    await read({ from: "2026-10-26T10:00:00.000Z" });
    expect(whereText().sql).not.toContain('"started_at" <=');
    await read({ from: "", to: "2026-10-26T10:00:00.000Z" });
    expect(whereText().sql).not.toContain('"ended_at" >=');
  });
});

describe("activity cursor", () => {
  it("round-trips to the millisecond", () => {
    const endedAt = new Date("2026-10-25T12:00:00.123Z");
    expect(decodeActivityCursor(encodeActivityCursor(endedAt, ID))).toEqual({ endedAt, id: ID });
    expect(decodeActivityCursor(undefined)).toBeUndefined();
    expect(decodeActivityCursor("")).toBeUndefined();
  });

  it("rejects a non-canonical timestamp or ID", () => {
    expect(decodeActivityCursor(Buffer.from(`2026-10-25|${ID}`).toString("base64url"))).toBeUndefined();
    expect(decodeActivityCursor(Buffer.from(`nonsense|${ID}`).toString("base64url"))).toBeUndefined();
  });
});
