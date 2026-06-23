function formatUtcClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function formatCurrentSummaryEventTime(endAt?: string): string {
  return `Ends at ${endAt ? formatUtcClockTime(endAt) : "—"}`;
}

export function formatSummaryEventTime(startAt: string, referenceDate: Date): string {
  const time = formatUtcClockTime(startAt);
  const referenceDateKey = referenceDate.toISOString().slice(0, 10);
  const eventDateKey = startAt.slice(0, 10);
  if (eventDateKey === referenceDateKey) {
    return time;
  }
  const weekday = new Date(startAt).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday} · ${time}`;
}
