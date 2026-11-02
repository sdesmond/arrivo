import assert from "node:assert/strict";
import { test } from "node:test";

import { readSeedPassword } from "./screenshot-env.mjs";

test("readSeedPassword returns the password from SCREENSHOT_SEED_PASSWORD", () => {
  assert.equal(readSeedPassword({ SCREENSHOT_SEED_PASSWORD: "from-env" }), "from-env");
});

test("readSeedPassword fails with a pointer to the seed docs when it is not set", () => {
  assert.throws(() => readSeedPassword({}), /SCREENSHOT_SEED_PASSWORD.*docs\/dev-seed-data\.md/s);
});

test("readSeedPassword treats an empty value as not set", () => {
  assert.throws(() => readSeedPassword({ SCREENSHOT_SEED_PASSWORD: "" }), /SCREENSHOT_SEED_PASSWORD/);
});
