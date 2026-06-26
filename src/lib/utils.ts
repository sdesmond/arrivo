import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getNow } from "@/lib/mock-date";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function asFloatingUtc(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    )
  );
}

/**
 * The wall-clock calendar date of `now` as a `YYYY-MM-DD` key.
 *
 * Packt is timezone-naive: stored event/reservation times are wall-clock strings
 * and "now" is read in the runtime's local frame (see {@link isEventNow}). Derive
 * "today" from local components — never `toISOString()`/`getUTC*`, which convert to
 * UTC and roll the date forward an evening west of UTC, dropping the current day's
 * events from views like the Now Card.
 */
export function getWallClockDateKey(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isEventPast(event: { endAt?: string }, now: Date): boolean {
  if (!event.endAt) return false;
  return new Date(event.endAt) < asFloatingUtc(now);
}

export function isEventNow(event: { startAt?: string; endAt?: string }, now: Date): boolean {
  if (!event.startAt || !event.endAt) return false;
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const floatingNow = asFloatingUtc(now);
  return start <= floatingNow && floatingNow <= end;
}

export function getTripStatus(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  now = getNow()
): "upcoming" | "active" | "past" {
  if (!startDate || !endDate) return "upcoming";
  const today = getWallClockDateKey(now);
  if (today < startDate) return "upcoming";
  if (today > endDate) return "past";
  return "active";
}

export function getActiveDayNumber(startDate: string, now = getNow()): number {
  const startParts = startDate.split("-").map(Number);
  const start = Date.UTC(startParts[0], startParts[1] - 1, startParts[2]);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - start) / 86_400_000) + 1;
}

export function getTodayDisplay(now = getNow()): { date: number; month: string } {
  return {
    date: now.getDate(),
    month: now.toLocaleString("en-US", { month: "short" }),
  };
}

export function formatTripDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const MDY_LOCALES = new Set(["en-US", "en-PH"]);

export function detectDefaultDateFormat(acceptLanguage: string): string {
  const primary = acceptLanguage.split(",")[0]?.split(";")[0]?.trim() ?? "";
  return MDY_LOCALES.has(primary) ? "MM/DD/YYYY" : "DD/MM/YYYY";
}

export function formatDate(dateStr: string, format: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  return format === "MM/DD/YYYY" ? `${month} ${day}, ${year}` : `${day} ${month} ${year}`;
}

export function getTripDays(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function getDisplayedTripDays(trip: {
  startDate?: string | null;
  endDate?: string | null;
  dayTotal?: number;
}): number {
  return trip.dayTotal !== undefined ? trip.dayTotal : getTripDays(trip.startDate, trip.endDate);
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function combineDateAndTimeToIso(date: string | undefined, time: string | undefined): string | undefined {
  if (!date || !time) return undefined;
  return `${date}T${time}:00.000Z`;
}

export function toLocalDateKey(iso: string): string {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toHHMM(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_COVER_IMAGE_UPLOAD_BYTES = 12 * 1024 * 1024;

export function inferDocKind(mimeType: string): "pdf" | "image" | "doc" {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  return "doc";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseGraphicCover(
  url: string | null | undefined
): { color: string; pattern: string; icon: string } | null {
  if (!url || !url.startsWith("graphic:")) return null;
  const rest = url.slice("graphic:".length);
  const firstSlash = rest.indexOf("/");
  if (firstSlash === -1) return null;

  const color = rest.slice(0, firstSlash);
  const afterColor = rest.slice(firstSlash + 1);
  if (!color.trim() || !afterColor.trim()) return null;

  const secondSlash = afterColor.indexOf("/");
  if (secondSlash === -1) {
    return { color, pattern: "slanted", icon: afterColor };
  }

  const pattern = afterColor.slice(0, secondSlash);
  const icon = afterColor.slice(secondSlash + 1);
  if (!pattern.trim() || !icon.trim()) return null;
  if (icon.includes("/")) return null;

  return { color, pattern, icon };
}

export const GRAPHIC_COVER_COLORS = [
  "var(--color-indigo-400)",
  "var(--color-pink-400)",
  "var(--color-teal-400)",
  "var(--color-amber-400)",
  "var(--color-red-400)",
  "var(--color-emerald-400)",
  "var(--color-slate-400)",
  "var(--color-violet-400)",
  "var(--color-orange-400)",
] as const;

export const GRAPHIC_COVER_PATTERNS = ["horizontal", "vertical", "slanted", "crosshatch", "dots", "none"] as const;

export const GRAPHIC_COVER_ICONS = [
  "plane",
  "map",
  "compass",
  "camera",
  "tent-tree",
  "ship",
  "backpack",
  "luggage",
  "bus",
  "car",
  "mountain",
  "tree-palm",
  "hotel",
  "road",
  "van",
  "caravan",
  "map-pin",
  "map-pinned",
  "trees",
] as const;

export function deriveGraphicCover(title: string): string {
  let hash = 5381;
  for (let index = 0; index < title.length; index++) {
    hash = ((hash << 5) + hash) ^ title.charCodeAt(index);
    hash = hash >>> 0;
  }

  const color = GRAPHIC_COVER_COLORS[hash % GRAPHIC_COVER_COLORS.length];
  const iconHash = (hash * 2654435761) >>> 0;
  const icon = GRAPHIC_COVER_ICONS[iconHash % GRAPHIC_COVER_ICONS.length];
  const pattern = GRAPHIC_COVER_PATTERNS[hash % GRAPHIC_COVER_PATTERNS.length];
  return `graphic:${color}/${pattern}/${icon}`;
}

export async function shareDoc(doc: { name: string; url?: string }): Promise<void> {
  const url = doc.url ?? "";
  try {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      await navigator.share({ title: doc.name, url });
    } else if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(url);
    }
  } catch {
    // Silently absorb AbortError (user cancelled) and permission errors
  }
}

export function extractCity(fullLocation: string | null | undefined): string {
  if (!fullLocation) return "";
  const trimmed = fullLocation.trim();
  const commaIndex = trimmed.indexOf(",");
  return commaIndex === -1 ? trimmed : trimmed.slice(0, commaIndex).trim();
}

export function getLocationDisplayLabel(name: string | null | undefined, address: string | null | undefined): string {
  const trimmedName = name?.trim();
  if (trimmedName) return trimmedName;
  return address?.trim() ?? "";
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val !== null && typeof val === "object" && !Array.isArray(val)
      ? Object.keys(val)
          .sort()
          .reduce<Record<string, unknown>>((sorted, key) => {
            sorted[key] = val[key];
            return sorted;
          }, {})
      : val
  );
}
