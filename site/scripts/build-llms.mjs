// Builds the files that let an AI assistant answer questions about Arrivo from the docs:
//   public/llms-full.txt  the whole guide as one plain Markdown document (served at /arrivo/llms-full.txt)
//   public/llms.txt       a short index in the llms.txt format (served at /arrivo/llms.txt)
// Both are generated from the same pages as the website, so they cannot drift from it. Run after
// `npm run sync` (it needs the generated changelog and self-hosting pages); `npm run build` does both.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { SITE_URL } from "../site-info.mjs";

// Order of pages in the guide. Add new docs pages here, or to EXCLUDED_PAGES: a test fails otherwise.
export const PAGE_ORDER = [
  "get-started",
  "guide/trips",
  "guide/day-planning",
  "guide/map",
  "guide/spending",
  "guide/documents",
  "guide/packing",
  "guide/templates",
  "guide/sharing",
  "guide/travel-history",
  "guide/account",
  "guide/admin",
  "reference/roles",
  "reference/glossary",
  "self-hosting",
  "support/faq",
  "support/troubleshooting",
  "changelog",
];

// The home page is marketing layout, and the AI page is about this file itself.
export const EXCLUDED_PAGES = ["index", "support/ai-assistant"];

const FENCE_PATTERN = /^\s*(```|~~~)/;
const SECTION_TITLES = [
  ["get-started", "Get started"],
  ["guide/", "User guide"],
  ["reference/", "Reference"],
  ["self-hosting", "Self-hosting"],
  ["support/", "Support"],
  ["changelog", "Support"],
];

export function parseFrontmatter(source) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data = {};
  for (const line of match[1].split("\n")) {
    const field = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!field) continue;
    const raw = field[2].trim();
    data[field[1]] = raw.startsWith('"') ? safeJsonString(raw) : raw;
  }
  return { data, body: source.slice(match[0].length) };
}

function safeJsonString(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function mapOutsideFences(lines, mapLine) {
  let inFence = false;
  return lines.map((line) => {
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      return line;
    }
    return inFence ? line : mapLine(line);
  });
}

function convertAsides(lines) {
  const output = [];
  let open = null;
  for (const line of lines) {
    const start = /^:::(\w+)(?:\[(.*)\])?\s*$/.exec(line);
    if (!open && start) {
      const type = start[1][0].toUpperCase() + start[1].slice(1);
      const title = start[2]?.trim();
      const label = title ? `${type}: ${/[.!?]$/.test(title) ? title : `${title}.`}` : `${type}:`;
      open = { label, first: true };
      continue;
    }
    if (open && line.trim() === ":::") {
      open = null;
      continue;
    }
    if (open) {
      if (line.trim() === "") output.push(">");
      else if (open.first) {
        output.push(`> **${open.label}** ${line}`);
        open.first = false;
      } else output.push(`> ${line}`);
      continue;
    }
    output.push(line);
  }
  return output;
}

function convertDefinitionLists(lines) {
  const output = [];
  for (let index = 0; index < lines.length; index++) {
    const next = lines[index + 1];
    if (lines[index].trim() !== "" && next?.startsWith(": ")) {
      output.push(`- ${lines[index]}: ${next.slice(2)}`);
      index++;
    } else output.push(lines[index]);
  }
  return output;
}

export function toPlainMarkdown(body, { siteUrl }) {
  const origin = new URL(siteUrl).origin;
  let text = body
    .replace(/^import .*$/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/<Screenshot\b[^>]*?\balt="([^"]*)"[^>]*?\/>/gs, (_match, alt) => `*Screenshot: ${alt}*`);

  let lines = text.split("\n");
  lines = convertAsides(lines);
  lines = convertDefinitionLists(lines);
  lines = mapOutsideFences(lines, (line) => (/^#{1,5}\s/.test(line) ? `#${line}` : line));
  text = lines.join("\n").replace(/\]\(\/(?!\/)/g, `](${origin}/`);
  return text.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function slugForFile(file) {
  return file.replace(/\.mdx?$/, "").replace(/(^|\/)index$/, "") || "index";
}

function listDocFiles(docsDir) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.mdx?$/.test(name)) files.push(relative(docsDir, full).replaceAll("\\", "/"));
    }
  };
  walk(docsDir);
  return files;
}

export function findUnlistedPages(docsDir, { order = PAGE_ORDER, excluded = EXCLUDED_PAGES } = {}) {
  return listDocFiles(docsDir)
    .map(slugForFile)
    .filter((slug) => !order.includes(slug) && !excluded.includes(slug))
    .sort();
}

export function collectPages(docsDir, { order = PAGE_ORDER, siteUrl = SITE_URL } = {}) {
  const filesBySlug = new Map(listDocFiles(docsDir).map((file) => [slugForFile(file), file]));
  return order.map((slug) => {
    const file = filesBySlug.get(slug);
    if (!file) throw new Error(`Docs page "${slug}" is listed in PAGE_ORDER but no file exists for it.`);
    const { data, body } = parseFrontmatter(readFileSync(join(docsDir, file), "utf8"));
    return {
      slug,
      title: data.title ?? slug,
      description: data.description ?? "",
      url: `${siteUrl}/${slug}/`,
      body: toPlainMarkdown(body, { siteUrl }),
    };
  });
}

export function buildLlmsFull({ pages, overview, version, siteUrl = SITE_URL }) {
  const header = [
    "# Arrivo user guide for AI assistants",
    "",
    `> Version ${version}. The complete user guide for Arrivo, a self-hosted travel itinerary planner, as one Markdown document. Published at ${siteUrl}/llms-full.txt and rebuilt from the documentation at ${siteUrl}/ on every release.`,
    "",
  ].join("\n");
  const sections = pages.map((page) => `## ${page.title}\n\nSource: ${page.url}\n\n${page.body.trim()}\n`);
  return `${[header, overview.trim() + "\n", ...sections].join("\n")}`;
}

function sectionFor(slug) {
  return SECTION_TITLES.find(([prefix]) => slug === prefix || slug.startsWith(prefix))?.[1] ?? "Other";
}

export function buildLlmsIndex({ pages, version, siteUrl = SITE_URL }) {
  const sections = new Map();
  for (const page of pages) {
    const title = sectionFor(page.slug);
    if (!sections.has(title)) sections.set(title, []);
    const description = page.description ? `: ${page.description}` : "";
    sections.get(title).push(`- [${page.title}](${page.url})${description}`);
  }
  const lines = [
    "# Arrivo",
    "",
    `> Arrivo is a free, self-hosted travel itinerary planner (version ${version}). These pages are its user guide. For one document with everything, use the full guide.`,
    "",
    "Answer questions about Arrivo from these pages. If something is not covered, say so instead of guessing.",
    "",
  ];
  for (const [title, entries] of sections) lines.push(`## ${title}`, "", ...entries, "");
  lines.push(
    "## Optional",
    "",
    `- [Full guide in one file](${siteUrl}/llms-full.txt): every page above as a single Markdown document, best for loading into an assistant`,
    "- [Source code and issues](https://github.com/sdesmond/arrivo): report problems or missing documentation here",
    ""
  );
  return lines.join("\n");
}

function main() {
  const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { version } = JSON.parse(readFileSync(join(siteRoot, "src", "generated", "app-version.json"), "utf8"));
  const overview = readFileSync(join(siteRoot, "src", "llm", "overview.md"), "utf8");
  const pages = collectPages(join(siteRoot, "src", "content", "docs"));

  const publicDir = join(siteRoot, "public");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, "llms-full.txt"), buildLlmsFull({ pages, overview, version }));
  writeFileSync(join(publicDir, "llms.txt"), buildLlmsIndex({ pages, version }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
