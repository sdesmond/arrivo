import { days } from "@/db/schema";

export function buildDayRows(tripId: string, startDate: string | undefined, endDate: string | undefined) {
  if (!startDate) return [];

  const start = new Date(startDate + "T00:00:00");
  const end = endDate ? new Date(endDate + "T00:00:00") : start;
  const dayRows: (typeof days.$inferInsert)[] = [];
  let current = new Date(start);
  let dayNumber = 1;

  while (current <= end) {
    dayRows.push({
      tripId,
      dayNumber,
      date: current.toISOString().slice(0, 10),
      label: `Day ${dayNumber}`,
    });
    dayNumber++;
    current = new Date(current.getTime() + 86_400_000);
  }

  return dayRows;
}
