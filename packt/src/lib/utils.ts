import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isEventNow(
  ev: { startAt?: string; endAt?: string; time?: string; durationMinutes?: number },
  now = new Date()
): boolean {
  if (ev.startAt && ev.endAt) {
    return now >= new Date(ev.startAt) && now < new Date(ev.endAt);
  }
  if (ev.time && ev.durationMinutes != null) {
    const [h, m] = ev.time.split(":").map(Number);
    const start = new Date(now);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + ev.durationMinutes * 60_000);
    return now >= start && now < end;
  }
  return false;
}
