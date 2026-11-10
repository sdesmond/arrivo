import { expect, it, vi } from "vitest";
import type { DbTransaction } from "@/lib/server-action-locks";
import { lockClientIds } from "./client-ids";

function statements(execute: ReturnType<typeof vi.fn>): string[] {
  return execute.mock.calls.map(([statement]) => JSON.stringify((statement as { queryChunks: unknown[] }).queryChunks));
}

it("takes one advisory lock per supplied resource, sorted so concurrent claims lock in one order", async () => {
  const execute = vi.fn(async () => []);
  await lockClientIds({ execute } as unknown as DbTransaction, ["event:b", "checklist:a"]);
  const calls = statements(execute);
  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.includes("pg_advisory_xact_lock"))).toBe(true);
  expect(calls[0]).toContain("checklist:a");
  expect(calls[1]).toContain("event:b");
});

it("skips absent and empty resources", async () => {
  const execute = vi.fn(async () => []);
  await lockClientIds({ execute } as unknown as DbTransaction, [undefined, "", "event:a"]);
  expect(execute).toHaveBeenCalledOnce();
  await lockClientIds({ execute } as unknown as DbTransaction, [undefined]);
  expect(execute).toHaveBeenCalledOnce();
});
