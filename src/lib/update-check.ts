import "server-only";
import type { AvailableUpdate } from "@/data/types";

/**
 * Asks GitHub for the latest published release. Nothing about this instance is sent.
 * `UPDATE_CHECK=false` turns it off.
 */

const LATEST_RELEASE_URL = "https://api.github.com/repos/sdesmond/arrivo/releases/latest";
const RELEASE_PAGE_BASE = "https://github.com/sdesmond/arrivo/releases/tag/v";
const TIMEOUT_MS = 3000;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 60 * 1000;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

interface UpdateCheckState {
  latest: Promise<string | null>;
  expiresAt: number;
}

declare global {
  var __updateCheck: UpdateCheckState | undefined;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "arrivo-update-check" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const release = (await response.json()) as { tag_name?: unknown } | null;
    const tag = release?.tag_name;
    if (typeof tag !== "string" || !tag.startsWith("v")) return null;
    const version = tag.slice(1);
    return VERSION_PATTERN.test(version) ? version : null;
  } catch {
    return null;
  }
}

/** The cached lookup. Its expiry is unset while in flight, so concurrent callers share one request. */
function getLatestVersion(): Promise<string | null> {
  const cached = globalThis.__updateCheck;
  if (cached && Date.now() < cached.expiresAt) return cached.latest;

  const state: UpdateCheckState = { latest: fetchLatestVersion(), expiresAt: Number.POSITIVE_INFINITY };
  globalThis.__updateCheck = state;
  void state.latest.then((version) => {
    state.expiresAt = Date.now() + (version ? SUCCESS_TTL_MS : FAILURE_TTL_MS);
  });
  return state.latest;
}

function isNewer(candidate: string, current: string): boolean {
  const candidateParts = VERSION_PATTERN.exec(candidate);
  const currentParts = VERSION_PATTERN.exec(current);
  if (!candidateParts || !currentParts) return false;
  for (let i = 1; i <= 3; i++) {
    const difference = Number(candidateParts[i]) - Number(currentParts[i]);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export async function getAvailableUpdate(): Promise<AvailableUpdate | null> {
  if (process.env.UPDATE_CHECK === "false") return null;
  const latest = process.env.E2E_UPDATE_STUB || (await getLatestVersion());
  if (!latest || !isNewer(latest, process.env.APP_VERSION ?? "")) return null;
  return { version: latest, url: `${RELEASE_PAGE_BASE}${latest}` };
}
