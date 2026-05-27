import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getNow } from "@/lib/mock-date";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isEventPast(event: { endAt?: string }, now: Date): boolean {
  if (!event.endAt) return false;
  return new Date(event.endAt) < now;
}

export function isEventNow(event: { startAt?: string; endAt?: string }, now: Date): boolean {
  if (!event.startAt || !event.endAt) return false;
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return start <= now && now <= end;
}

export function getTripStatus(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  now = getNow()
): "upcoming" | "active" | "past" {
  if (!startDate || !endDate) return "upcoming";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (today < start) return "upcoming";
  if (today > end) return "past";
  return "active";
}

export function getActiveDayNumber(startDate: string, now = getNow()): number {
  const start = new Date(startDate + "T00:00:00");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1;
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

export function toHHMM(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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
