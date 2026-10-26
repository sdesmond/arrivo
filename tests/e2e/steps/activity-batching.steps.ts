import { expect } from "@playwright/test";
import { After, Given, When, Then } from "../fixtures";
import { createActivityBatchFixture, type ActivityBatchFixture } from "../activity-batch-fixture";
import { createLockGate } from "../role-service-fixture";
import type { ScenarioFixtureContext } from "../scenario-fixture";

const FIXTURE_KEY = "activityBatchFixture";

type Scenario = ScenarioFixtureContext;

const fixtureOf = (scenario: Scenario) => scenario.getValue<ActivityBatchFixture>(FIXTURE_KEY)!;

const parseOffsets = (csv: string) => csv.split(",").map((value) => Number(value));

After(async ({ scenario }) => {
  await scenario.getValue<ActivityBatchFixture>(FIXTURE_KEY)?.close();
});

Given("an isolated Activity store", async ({ scenario }) => {
  // Registered before anything else so a failed setup still drops the schema.
  scenario.setValue(FIXTURE_KEY, await createActivityBatchFixture());
});

// Edits are written one after another, in the order listed, so arrival order can differ from occurrence order.
When(
  "{word} edits trip {word} at offsets {string} ms",
  async ({ scenario }, actor: string, trip: string, csv: string) => {
    for (const offsetMs of parseOffsets(csv)) await fixtureOf(scenario).record({ actor, trip, offsetMs });
  }
);

When(
  "{word} edits trip {word} as username {string} at offsets {string} ms",
  async ({ scenario }, actor: string, trip: string, username: string, csv: string) => {
    for (const offsetMs of parseOffsets(csv)) await fixtureOf(scenario).record({ actor, username, trip, offsetMs });
  }
);

When(
  "{word} edits trip {word} at offsets {string} and {string} ms at the same time",
  async ({ scenario }, actor: string, trip: string, firstOffset: string, secondOffset: string) => {
    const fixture = fixtureOf(scenario);
    const gate = createLockGate();

    // The first writer holds the partition lock until the second is verifiably queued behind it.
    const first = fixture.record({ actor, trip, offsetMs: Number(firstOffset) }, gate);
    await gate.reached;
    const second = fixture.record({ actor, trip, offsetMs: Number(secondOffset) });
    try {
      await fixture.waitForBlockedTransaction();
    } finally {
      gate.release();
    }
    await Promise.all([first, second]);
  }
);

Then("the store holds {int} row(s)", async ({ scenario }, count: number) => {
  expect(await fixtureOf(scenario).rows()).toHaveLength(count);
});

Then(
  "the row for {word} on trip {word} spans {string} to {string} ms",
  async ({ scenario }, actor: string, trip: string, startMs: string, endMs: string) => {
    const rows = await fixtureOf(scenario).rows();
    expect(rows.filter((row) => row.actor === actor && row.trip === trip && row.username === actor)).toEqual([
      expect.objectContaining({ startMs: Number(startMs), endMs: Number(endMs) }),
    ]);
  }
);

Then(
  "the row for username {word} spans {string} to {string} ms",
  async ({ scenario }, username: string, startMs: string, endMs: string) => {
    const rows = await fixtureOf(scenario).rows();
    expect(rows.filter((row) => row.username === username)).toEqual([
      expect.objectContaining({ startMs: Number(startMs), endMs: Number(endMs) }),
    ]);
  }
);
