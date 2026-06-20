import { asc, eq, sql } from "drizzle-orm";
import { days, trips } from "@/db/schema";
import type { DbTransaction } from "@/lib/server-action-locks";

export const MAX_TRIP_DAYS = 45;
const DAY_NUMBER_SHIFT_OFFSET = 1000;

export function nextCalendarDate(date: string): string {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

export async function extendTripDateRange(
  transaction: DbTransaction,
  tripId: string,
  tripStartDate: string | undefined,
  tripEndDate: string | undefined,
  reservationStartAt: string | undefined,
  reservationEndAt: string | undefined
): Promise<{ newStartDate?: string; newEndDate?: string }> {
  const reservationStartDate = reservationStartAt?.slice(0, 10);
  const reservationEndDate = reservationEndAt?.slice(0, 10);
  const reservationDates = [reservationStartDate, reservationEndDate].filter((date): date is string => !!date).sort();
  const earliestReservationDate = reservationDates[0];
  const latestReservationDate = reservationDates.at(-1);

  const needsStartExtension = !!earliestReservationDate && (!tripStartDate || earliestReservationDate < tripStartDate);
  const needsEndExtension = !!latestReservationDate && (!tripEndDate || latestReservationDate > tripEndDate);
  if (!needsStartExtension && !needsEndExtension) {
    return {};
  }

  const newStartDate = needsStartExtension ? earliestReservationDate : (tripStartDate ?? latestReservationDate);
  const newEndDate = needsEndExtension ? latestReservationDate : (tripEndDate ?? earliestReservationDate);
  if (!newStartDate || !newEndDate) {
    return {};
  }

  const newRangeSpanMs =
    new Date(`${newEndDate}T00:00:00.000Z`).getTime() - new Date(`${newStartDate}T00:00:00.000Z`).getTime();
  const newRangeSpanDays = Math.round(newRangeSpanMs / (24 * 60 * 60 * 1000)) + 1;
  if (newRangeSpanDays > MAX_TRIP_DAYS) {
    throw new Error("Trip cannot exceed 45 days.");
  }

  const existingDayCount =
    (
      await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(days)
        .where(eq(days.tripId, tripId))
    )[0]?.count ?? 0;

  const allDates: string[] = [];
  let cursor = newStartDate;
  while (cursor <= newEndDate) {
    allDates.push(cursor);
    cursor = nextCalendarDate(cursor);
  }

  const existingDayDates = new Set(
    (await transaction.select({ date: days.date }).from(days).where(eq(days.tripId, tripId)))
      .map((day) => day.date)
      .filter((date): date is string => !!date)
  );

  const newDateStrings = allDates.filter((date) => !existingDayDates.has(date));
  const totalDaysAfter = existingDayCount + newDateStrings.length;
  if (totalDaysAfter > MAX_TRIP_DAYS) {
    throw new Error("Trip cannot exceed 45 days.");
  }

  const sortedDatesForInsert = [...newDateStrings].sort((leftDate, rightDate) => {
    const leftIsBeforeRange = !!tripStartDate && leftDate < tripStartDate;
    const rightIsBeforeRange = !!tripStartDate && rightDate < tripStartDate;
    if (leftIsBeforeRange && rightIsBeforeRange) {
      return rightDate.localeCompare(leftDate);
    }
    if (!leftIsBeforeRange && !rightIsBeforeRange) {
      return leftDate.localeCompare(rightDate);
    }
    return leftIsBeforeRange ? -1 : 1;
  });

  for (const date of sortedDatesForInsert) {
    const isBeforeRange = !!tripStartDate && date < tripStartDate;
    if (isBeforeRange) {
      await transaction
        .update(days)
        .set({
          dayNumber: sql`${days.dayNumber} + ${DAY_NUMBER_SHIFT_OFFSET}`,
          label: sql`concat('Day ', ${days.dayNumber} + ${DAY_NUMBER_SHIFT_OFFSET})`,
        })
        .where(eq(days.tripId, tripId));
      await transaction
        .update(days)
        .set({
          dayNumber: sql`${days.dayNumber} - ${DAY_NUMBER_SHIFT_OFFSET - 1}`,
          label: sql`concat('Day ', ${days.dayNumber} - ${DAY_NUMBER_SHIFT_OFFSET - 1})`,
        })
        .where(eq(days.tripId, tripId));

      await transaction.insert(days).values({
        tripId,
        dayNumber: 1,
        date,
        label: "Day 1",
      });
      continue;
    }

    const existingDays = await transaction
      .select({ dayNumber: days.dayNumber })
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(asc(days.dayNumber));
    const nextDayNumber = (existingDays.at(-1)?.dayNumber ?? 0) + 1;

    await transaction.insert(days).values({
      tripId,
      dayNumber: nextDayNumber,
      date,
      label: `Day ${nextDayNumber}`,
    });
  }

  const tripUpdates: Record<string, string | Date> = { updatedAt: new Date() };
  if (needsStartExtension) {
    tripUpdates.startDate = newStartDate;
  }
  if (needsEndExtension) {
    tripUpdates.endDate = newEndDate;
  }

  await transaction.update(trips).set(tripUpdates).where(eq(trips.id, tripId));

  return {
    newStartDate: needsStartExtension ? newStartDate : undefined,
    newEndDate: needsEndExtension ? newEndDate : undefined,
  };
}
