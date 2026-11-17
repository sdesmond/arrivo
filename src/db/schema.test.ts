// @vitest-environment node
import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { idempotencyKeys } from "./schema";

/** One entry of an index's `config.columns`: a column, or SQL for an expression index. */
type IndexConfigColumn = ReturnType<typeof getTableConfig>["indexes"][number]["config"]["columns"][number];

function columnName(column: IndexConfigColumn): string | undefined {
  return "name" in column ? column.name : undefined;
}

it("indexes idempotency_keys by created_at, so the retention sweep reads only expired rows", () => {
  const indexes = getTableConfig(idempotencyKeys).indexes.map((index) => ({
    name: index.config.name,
    columns: index.config.columns.map(columnName),
  }));
  expect(indexes).toContainEqual({ name: "idempotency_keys_created_at_idx", columns: ["created_at"] });
});
