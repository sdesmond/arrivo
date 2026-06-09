import { days } from "@/db/schema";

export function buildDatelessDayRow(tripId: string): typeof days.$inferInsert {
  return { tripId, dayNumber: 1, date: null, label: "Day 1" };
}

export function buildDayRows(
  tripId: string,
  startDate: string | undefined,
  endDate: string | undefined
): (typeof days.$inferInsert)[] {
  if (!startDate) return [];

  let start = new Date(startDate + "T00:00:00");
  let end = endDate ? new Date(endDate + "T00:00:00") : start;

  if (end < start) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  const rawDayCount = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  if (rawDayCount > 45) {
    throw new Error(`Max trip length is 45 days (got ${rawDayCount}). Please shorten your date range.`);
  }

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
