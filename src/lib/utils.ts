import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getNow } from "@/lib/mock-date"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isEventPast(
  ev: { date?: string; time?: string; endTime?: string; endAt?: string },
  now = getNow()
): boolean {
  if (ev.endAt) return now > new Date(ev.endAt);
  if (ev.date) {
    const timeStr = ev.endTime ?? ev.time;
    if (timeStr) {
      const [h, m] = timeStr.split(":").map(Number);
      const dt = new Date(ev.date);
      dt.setHours(h, m, 0, 0);
      return now > dt;
    }
    const dt = new Date(ev.date);
    dt.setHours(23, 59, 59, 999);
    return now > dt;
  }
  return false;
}

export function isEventNow(
  ev: { startAt?: string; endAt?: string; time?: string; endTime?: string; date?: string },
  now = getNow()
): boolean {
  if (ev.startAt && ev.endAt) {
    return now >= new Date(ev.startAt) && now < new Date(ev.endAt);
  }
  if (ev.time && ev.endTime) {
    if (ev.date) {
      const d = new Date(ev.date + "T12:00:00");
      if (
        d.getFullYear() !== now.getFullYear() ||
        d.getMonth() !== now.getMonth() ||
        d.getDate() !== now.getDate()
      ) return false;
    }
    const [sh, sm] = ev.time.split(":").map(Number);
    const [eh, em] = ev.endTime.split(":").map(Number);
    const start = new Date(now); start.setHours(sh, sm, 0, 0);
    const end = new Date(now);   end.setHours(eh, em, 0, 0);
    return now >= start && now < end;
  }
  return false;
}

export function getTripStatus(
  startDate: string,
  endDate: string,
  now = getNow()
): "upcoming" | "active" | "past" {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate + "T00:00:00");
  const end   = new Date(endDate   + "T00:00:00");
  if (today < start) return "upcoming";
  if (today > end)   return "past";
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
    date:  now.getDate(),
    month: now.toLocaleString("en-US", { month: "short" }),
  };
}
