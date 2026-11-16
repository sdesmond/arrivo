import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { idempotencyKeys } from "../../../src/db/schema";
import { IDEMPOTENCY_RETENTION_MS } from "../../../src/lib/idempotency-retention";
import { After, Given, Then } from "../fixtures";
import { withE2EDb } from "../e2e-db";
import { createIdempotencyRetentionFixture, type IdempotencyRetentionFixture } from "../idempotency-retention-fixture";

const FIXTURE_KEY = "idempotencyRetentionFixture";
const RECORDS_KEY = "idempotencyRetentionRecords";

interface ReplayRecords {
  userId: string;
  expired: string;
  live: string;
}

function storedKeys(records: ReplayRecords) {
  return withE2EDb(async (database) =>
    (
      await database
        .select({ key: idempotencyKeys.key })
        .from(idempotencyKeys)
        .where(
          and(eq(idempotencyKeys.userId, records.userId), inArray(idempotencyKeys.key, [records.expired, records.live]))
        )
    ).map((row) => row.key)
  );
}

After(async ({ scenario }) => {
  await scenario.getValue<IdempotencyRetentionFixture>(FIXTURE_KEY)?.close();
  const records = scenario.getValue<ReplayRecords>(RECORDS_KEY);
  if (records) {
    await withE2EDb((database) =>
      database
        .delete(idempotencyKeys)
        .where(
          and(eq(idempotencyKeys.userId, records.userId), inArray(idempotencyKeys.key, [records.expired, records.live]))
        )
    );
  }
});

Given("I have an expired replay record and a live one", async ({ scenario }) => {
  const user = await scenario.ensureCurrentUser();
  const records: ReplayRecords = {
    userId: user.id,
    expired: `api:v1:expired-${randomUUID()}`,
    live: `api:v1:live-${randomUUID()}`,
  };
  const now = Date.now();
  await withE2EDb((database) =>
    database.insert(idempotencyKeys).values([
      {
        key: records.expired,
        userId: user.id,
        result: {},
        createdAt: new Date(now - IDEMPOTENCY_RETENTION_MS - 60_000),
      },
      { key: records.live, userId: user.id, result: {}, createdAt: new Date(now - 60_000) },
    ])
  );
  scenario.setValue(RECORDS_KEY, records);
});

Then("my expired replay record is deleted", async ({ scenario }) => {
  const records = scenario.getValue<ReplayRecords>(RECORDS_KEY)!;
  await expect.poll(() => storedKeys(records)).not.toContain(records.expired);
});

Then("my live replay record is kept", async ({ scenario }) => {
  const records = scenario.getValue<ReplayRecords>(RECORDS_KEY)!;
  expect(await storedKeys(records)).toEqual([records.live]);
});

Given("an isolated idempotency key table", async ({ scenario }) => {
  scenario.setValue(FIXTURE_KEY, await createIdempotencyRetentionFixture());
});

Then("the replay record sweep verifies {string}", async ({ scenario }, testCase: string) => {
  await scenario.getValue<IdempotencyRetentionFixture>(FIXTURE_KEY)!.verify(testCase);
});
