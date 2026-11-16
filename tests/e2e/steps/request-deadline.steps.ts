import { After, Given, Then } from "../fixtures";
import { createRequestDeadlineFixture, type RequestDeadlineFixture } from "../request-deadline-fixture";

const FIXTURE_KEY = "requestDeadlineFixture";

After(async ({ scenario }) => {
  await scenario.getValue<RequestDeadlineFixture>(FIXTURE_KEY)?.close();
});

Given("an isolated deadline probe table", async ({ scenario }) => {
  scenario.setValue(FIXTURE_KEY, await createRequestDeadlineFixture());
});

Then("the guarded write verifies {string}", async ({ scenario }, testCase: string) => {
  await scenario.getValue<RequestDeadlineFixture>(FIXTURE_KEY)!.verify(testCase);
});
