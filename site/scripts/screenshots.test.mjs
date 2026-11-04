import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { SHOTS } from "./screenshots.mjs";

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCREENSHOTS_DIR = join(SITE_ROOT, "src", "assets", "screenshots");
const DOCS_DIR = join(SITE_ROOT, "src", "content", "docs");
const THEMES = ["light", "dark"];

function listDocs(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listDocs(path);
    return /\.mdx?$/.test(entry.name) ? [path] : [];
  });
}

// Matches `<Screenshot name="x" ...>` even when the props span several lines.
function screenshotNamesUsedInDocs() {
  const used = new Map();
  for (const file of listDocs(DOCS_DIR)) {
    for (const [, name] of readFileSync(file, "utf8").matchAll(/<Screenshot\b[^>]*?\bname="([^"]+)"/gs)) {
      used.set(name, file);
    }
  }
  return used;
}

test("every shot has a unique name and an account to sign in as (or none for signed-out pages)", () => {
  const names = SHOTS.map((shot) => shot.name);
  assert.equal(new Set(names).size, names.length, `Duplicate shot names: ${names.join(", ")}`);
  for (const shot of SHOTS) {
    assert.match(shot.name, /^[a-z0-9-]+$/, `Shot name "${shot.name}" must be kebab-case`);
    assert.ok("account" in shot, `Shot "${shot.name}" must set account (null for signed-out)`);
    assert.equal(typeof shot.run, "function", `Shot "${shot.name}" needs a run function`);
  }
});

test("every shot has a committed light and dark screenshot", () => {
  const missing = SHOTS.flatMap((shot) =>
    THEMES.filter((theme) => !existsSync(join(SCREENSHOTS_DIR, theme, `${shot.name}.webp`))).map(
      (theme) => `${theme}/${shot.name}.webp`
    )
  );
  assert.deepEqual(missing, [], `Run \`npm run screenshots\` to generate: ${missing.join(", ")}`);
});

test("every screenshot a docs page uses comes from a shot, so it can be regenerated", () => {
  const shotNames = new Set(SHOTS.map((shot) => shot.name));
  const orphans = [...screenshotNamesUsedInDocs()].filter(([name]) => !shotNames.has(name));
  assert.deepEqual(
    orphans.map(([name, file]) => `${name} (${file})`),
    [],
    "Docs reference screenshots that no shot in screenshots.mjs produces"
  );
});

test("the profile photo hover shot is registered for the demo account", () => {
  const shot = SHOTS.find((candidate) => candidate.name === "profile-photo");
  assert.ok(shot, "profile-photo shot is missing");
  assert.equal(shot.account, "demo");
  assert.ok(screenshotNamesUsedInDocs().has("profile-photo"), "No docs page shows the profile-photo screenshot");
});
