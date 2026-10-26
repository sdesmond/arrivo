/** Client-safe helpers turning a calendar day in a timezone into UTC instants and back. */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function zoneOffsetMs(timestamp: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (name: string) => Number(parts.find((entry) => entry.type === name)?.value);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

function startOfDayMs(year: number, monthIndex: number, day: number, timeZone: string): number {
  const guess = Date.UTC(year, monthIndex, day);
  const first = guess - zoneOffsetMs(guess, timeZone);
  // The offset can differ at the corrected instant when a DST change falls between the guess and the answer.
  return guess - zoneOffsetMs(first, timeZone);
}

/** "2026-10-26" -> the first (`start`) or last (`end`) millisecond of that day in `timeZone`, as an ISO instant. */
export function dayToInstant(day: string, timeZone: string, edge: "start" | "end"): string | undefined {
  const match = DAY.exec(day);
  if (!match) return undefined;
  const [year, monthIndex, dayOfMonth] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const probe = new Date(Date.UTC(year, monthIndex, dayOfMonth));
  if (probe.getUTCMonth() !== monthIndex || probe.getUTCDate() !== dayOfMonth) return undefined;
  const timestamp =
    edge === "start"
      ? startOfDayMs(year, monthIndex, dayOfMonth, timeZone)
      : startOfDayMs(year, monthIndex, dayOfMonth + 1, timeZone) - 1;
  return new Date(timestamp).toISOString();
}

/** An ISO instant -> the "YYYY-MM-DD" calendar day it falls on in `timeZone`; empty when unreadable. */
export function instantToDay(instant: string | undefined, timeZone: string): string {
  if (!instant) return "";
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** "2026-10-25T14:03:07.000Z" -> "2026-10-25 14:03:07 MDT" in `timeZone`. */
export function formatInstant(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")} ${part("timeZoneName")}`;
}
