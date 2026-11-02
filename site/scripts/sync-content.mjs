// Generates docs pages from repo files so the site never duplicates them by hand:
//   CHANGELOG.md          -> src/content/docs/changelog.md
//   docs/self-hosting.md  -> src/content/docs/self-hosting/index.md
// Both outputs are git-ignored; `npm run sync` (run before dev/build) regenerates them.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_URL = "https://github.com/sdesmond/arrivo";
const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const FENCE_PATTERN = /^\s*(```|~~~)/;

function mapOutsideFences(markdown, mapLine) {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (FENCE_PATTERN.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : mapLine(line);
    })
    .join("\n");
}

function frontmatter(fields) {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

export function rewriteRelativeLinks(markdown, repoUrl, baseDir = "") {
  return markdown.replace(/\]\(([^)\s]+)\)/g, (match, target) => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(target)) return match;
    const resolved = posix.normalize(posix.join(baseDir || "docs", target.replace(/^\.\//, "")));
    return `](${repoUrl}/blob/main/${resolved})`;
  });
}

export function buildChangelogPage(markdown) {
  const body = mapOutsideFences(markdown, (line) => (/^# Changelog\s*$/.test(line) ? "" : line)).trim();
  return `${frontmatter({
    title: "Changelog",
    description: "What changed in each Arrivo release.",
  })}\n${body}\n`;
}

export function buildSelfHostingPage(markdown, repoUrl) {
  const withoutTitle = mapOutsideFences(markdown, (line) => {
    const match = HEADING_PATTERN.exec(line);
    return match && match[1] === "#" ? "" : line;
  });
  // docs/self-hosting.md lives in docs/, so its `../x` links resolve against the repo root.
  const withLinks = rewriteRelativeLinks(withoutTitle, repoUrl, "docs");
  return `${frontmatter({
    title: "Self-hosting Arrivo",
    description: "Run Arrivo on your own server with Docker: install, configure, secure, update and back up.",
  })}\n<!-- Generated from docs/self-hosting.md by site/scripts/sync-content.mjs. Edit that file instead. -->\n\n${withLinks.trim()}\n`;
}

function writeGenerated(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function main() {
  const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = join(siteRoot, "..");
  const docsDir = join(siteRoot, "src", "content", "docs");

  const changelog = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");
  writeGenerated(join(docsDir, "changelog.md"), buildChangelogPage(changelog));

  const selfHosting = readFileSync(join(repoRoot, "docs", "self-hosting.md"), "utf8");
  writeGenerated(join(docsDir, "self-hosting", "index.md"), buildSelfHostingPage(selfHosting, REPO_URL));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
