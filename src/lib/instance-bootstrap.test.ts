// @vitest-environment node
import { describe, expect, it } from "vitest";
import { instanceState, users } from "@/db/schema";
import type { BootstrapAccountValues, BootstrapResult } from "@/data/types";
import { bootstrapFirstAccount, type BootstrapDatabase } from "./instance-bootstrap";

interface FakeState {
  initializedAt: Date | null;
  rows: { id: string; username: string; role: string }[];
}

// Serializes transactions the way `select ... for update` on the singleton row does.
function createFakeDatabase(initial: Partial<FakeState> = {}, uniqueViolationFor?: string, missingRow = false) {
  const state: FakeState = { initializedAt: null, rows: [], ...initial };
  let tail: Promise<unknown> = Promise.resolve();

  const database = {
    transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => (release = resolve));
      await previous;
      const snapshot = { initializedAt: state.initializedAt, rows: [...state.rows] };
      try {
        return await run({
          execute: async () => (missingRow ? [] : [{ initializedAt: state.initializedAt }]),
          insert: (table: unknown) => {
            if (table !== users) throw new Error("Unexpected insert");
            return {
              values: (values: { username: string; role: string }) => ({
                returning: async () => {
                  await Promise.resolve();
                  if (values.username === uniqueViolationFor) {
                    throw new Error("Failed query", { cause: { code: "23505" } });
                  }
                  const row = { id: `user-${state.rows.length + 1}`, username: values.username, role: values.role };
                  state.rows.push(row);
                  return [{ id: row.id }];
                },
              }),
            };
          },
          update: (table: unknown) => {
            if (table !== instanceState) throw new Error("Unexpected update");
            return {
              set: (values: { initializedAt: Date }) => ({
                where: async () => {
                  state.initializedAt = values.initializedAt;
                },
              }),
            };
          },
        });
      } catch (error) {
        state.initializedAt = snapshot.initializedAt;
        state.rows = snapshot.rows;
        throw error;
      } finally {
        release();
      }
    },
  };
  return { state, database: database as unknown as BootstrapDatabase };
}

const values = (username: string): BootstrapAccountValues => ({
  username,
  name: "Name",
  passwordHash: "hash",
  currency: "USD",
});

describe("bootstrapFirstAccount", () => {
  it("makes the first signup an admin and marks the instance initialized", async () => {
    const { state, database } = createFakeDatabase();

    await expect(bootstrapFirstAccount(database, values("first"))).resolves.toEqual({ ok: true, userId: "user-1" });

    expect(state.rows).toEqual([{ id: "user-1", username: "first", role: "admin" }]);
    expect(state.initializedAt).toBeInstanceOf(Date);
  });

  it("creates exactly one admin when two first signups race", async () => {
    const { state, database } = createFakeDatabase();

    const results: BootstrapResult[] = await Promise.all([
      bootstrapFirstAccount(database, values("alpha")),
      bootstrapFirstAccount(database, values("bravo")),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "closed" }]);
    expect(state.rows).toHaveLength(1);
  });

  it("refuses once the instance is initialized and inserts nothing", async () => {
    const { state, database } = createFakeDatabase({ initializedAt: new Date() });

    await expect(bootstrapFirstAccount(database, values("late"))).resolves.toEqual({ ok: false, reason: "closed" });
    expect(state.rows).toEqual([]);
  });

  it("treats a missing instance_state row as closed and inserts nothing", async () => {
    const { state, database } = createFakeDatabase({}, undefined, true);

    await expect(bootstrapFirstAccount(database, values("orphan"))).resolves.toEqual({ ok: false, reason: "closed" });
    expect(state.rows).toEqual([]);
  });

  it("rolls back and leaves the instance fresh when the username is taken", async () => {
    const { state, database } = createFakeDatabase({}, "taken");

    await expect(bootstrapFirstAccount(database, values("taken"))).rejects.toThrow("Failed query");
    expect(state.initializedAt).toBeNull();
    expect(state.rows).toEqual([]);
  });
});
