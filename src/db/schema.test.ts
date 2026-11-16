// @vitest-environment node
import { expect, it } from "vitest";
import { getTableConfig, type IndexColumn } from "drizzle-orm/pg-core";
import { idempotencyKeys } from "./schema";

function columnName(column: IndexColumn): string | undefined {
  return "name" in column ? column.name : undefined;
}

it("indexes idempotency_keys by created_at, so the retention sweep reads only expired rows", () => {
  const indexes = getTableConfig(idempotencyKeys).indexes.map((index) => ({
    name: index.config.name,
    columns: index.config.columns.map(columnName),
  }));
  expect(indexes).toContainEqual({ name: "idempotency_keys_created_at_idx", columns: ["created_at"] });
});
