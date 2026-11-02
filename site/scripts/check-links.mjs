// Verifies every internal href in the built site (dist/) resolves to a built page or asset.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HREF_PATTERN = /\bhref="([^"]+)"/g;
const ID_PATTERN = /\bid="([^"]+)"/g;

function candidates(path) {
  const clean = path.replace(/\/$/, "");
  return [clean, `${clean}/index.html`, `${clean}.html`];
}

function hasId(html, id) {
  return [...html.matchAll(ID_PATTERN)].some(([, candidate]) => candidate === id);
}

export function findBrokenLinks(pages, base) {
  const known = new Set(pages.keys());
  const broken = [];
  for (const [page, html] of pages) {
    if (!page.endsWith(".html")) continue;
    for (const [, href] of html.matchAll(HREF_PATTERN)) {
      if (!href.startsWith(`${base}/`)) continue;
      const path = href.slice(base.length + 1).split(/[?#]/)[0];
      const fragment = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
      const target = path === "" ? "index.html" : candidates(path).find((candidate) => known.has(candidate));
      const found =
        target !== undefined && (!fragment || !target.endsWith(".html") || hasId(pages.get(target) ?? "", fragment));
      if (!found) broken.push({ page, href });
    }
  }
  return broken;
}

function readTree(root) {
  const files = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        files.set(relative(root, full).replaceAll("\\", "/"), name.endsWith(".html") ? readFileSync(full, "utf8") : "");
    }
  };
  walk(root);
  return files;
}

function main() {
  const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
  if (!existsSync(dist)) throw new Error("dist/ not found: run `npm run build` first");
  const broken = findBrokenLinks(readTree(dist), "/arrivo");
  for (const { page, href } of broken) console.error(`broken link in ${page}: ${href}`);
  if (broken.length > 0) process.exit(1);
  console.log("All internal links resolve.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
