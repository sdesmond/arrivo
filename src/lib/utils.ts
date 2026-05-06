import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isEventPast(
  ev: { date?: string; time?: string; endTime?: string; endAt?: string },
  now = new Date()
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
  ev: { startAt?: string; endAt?: string; time?: string; endTime?: string },
  now = new Date()
): boolean {
  if (ev.startAt && ev.endAt) {
    return now >= new Date(ev.startAt) && now < new Date(ev.endAt);
  }
  if (ev.time && ev.endTime) {
    const [sh, sm] = ev.time.split(":").map(Number);
    const [eh, em] = ev.endTime.split(":").map(Number);
    const start = new Date(now); start.setHours(sh, sm, 0, 0);
    const end = new Date(now);   end.setHours(eh, em, 0, 0);
    return now >= start && now < end;
  }
  return false;
}
