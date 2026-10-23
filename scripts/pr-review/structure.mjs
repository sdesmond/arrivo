// Scripted stand-ins for the two model-judged checks (title/description and scope). Rules are deliberately blunt:
// they catch absent or obviously generic text and size/shape outliers, not whether prose is good.
import { scopeStats } from "./checks.mjs";

const MIN_TITLE_CHARS = 8;
const MIN_BODY_CHARS = 40;
const MAX_AREAS = 5;
const MAX_TITLE_ITEMS = 3;
const LARGE_CHANGE_LINES = 2000;
const EXPLAINED_BODY_CHARS = 300;

const GENERIC_TITLE =
  /^(v?\d+\.\d+\.\d+|fix(es)?|bug ?fix(es)?|update[sd]?|change[sd]?|misc\w*|wip|stuff|cleanup|refactor(ing)?|tests?|testing|tweaks?)$/i;
const FILLER_WORD = /\b(stuff|misc|wip)\b/i;
const AI_ATTRIBUTION = /generated with \[?claude|co-authored-by:\s*claude|noreply@anthropic\.com/i;

// The description minus what a template contributes on its own: HTML comments, headings and the changelog checkboxes
// (see .github/PULL_REQUEST_TEMPLATE.md). An untouched template therefore counts as empty.
function cleanBody(body) {
  return body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*#{1,6}\s.*$/gm, "")
    .replace(/^\s*[-*]\s*\[[ xX]\]\s*This change is (not )?visible.*$/gm, "")
    .trim();
}

export function checkDescription({ title, body }) {
  const text = title.trim();
  const description = cleanBody(body);
  if (AI_ATTRIBUTION.test(`${title}\n${body}`)) {
    return { verdict: "WARN", reason: "Title or description credits an AI tool." };
  }
  if (description === "") return { verdict: "WARN", reason: "Description is empty." };
  if (description.length < MIN_BODY_CHARS) {
    return { verdict: "WARN", reason: "Description is too short to explain what and why." };
  }
  if (GENERIC_TITLE.test(text) || FILLER_WORD.test(text)) {
    return { verdict: "WARN", reason: "Title is generic; say what changed." };
  }
  if (text.length < MIN_TITLE_CHARS) return { verdict: "WARN", reason: "Title is too short to say what changed." };
  return { verdict: "PASS", reason: "Title and description are present and specific enough." };
}

export function checkScopeShape({ title, body, files }) {
  const stats = scopeStats(files);
  if (stats.areas.length >= MAX_AREAS) {
    return { verdict: "WARN", reason: `${stats.areas.length} areas changed (${stats.areas.join(", ")}).` };
  }
  const items = title.split(/[;,]/).filter((part) => part.trim() !== "");
  if (items.length >= MAX_TITLE_ITEMS) {
    return { verdict: "WARN", reason: `Title lists ${items.length} separate items.` };
  }
  if (stats.significantLines > LARGE_CHANGE_LINES && cleanBody(body).length < EXPLAINED_BODY_CHARS) {
    return { verdict: "WARN", reason: `${stats.significantLines} lines changed with little explanation.` };
  }
  return { verdict: "PASS", reason: "Changes stay within a few areas." };
}

export function structureVerdicts({ title, body, files }) {
  return { title: checkDescription({ title, body }), scope: checkScopeShape({ title, body, files }) };
}
