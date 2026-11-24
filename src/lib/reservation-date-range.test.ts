import { expect, it } from "vitest";
import { days, trips } from "@/db/schema";
import type { DbTransaction } from "@/lib/server-action-locks";
import { extendTripDateRange, nextCalendarDate } from "./reservation-date-range";

it("advances across month and year boundaries", () => {
  expect(nextCalendarDate("2024-02-28")).toBe("2024-02-29");
  expect(nextCalendarDate("2026-12-31")).toBe("2027-01-01");
});

function transactionForRange() {
  const inserted: Record<string, unknown>[] = [];
  const updated: { table: unknown; values: Record<string, unknown> }[] = [];
  let read = 0;
  const transaction = {
    select: () => ({
      from: () => ({
        where: () => {
          read += 1;
          if (read === 1) return Promise.resolve([{ count: 3 }]);
          if (read === 2)
            return Promise.resolve([{ date: "2030-06-10" }, { date: "2030-06-11" }, { date: "2030-06-12" }]);
          return { orderBy: async () => [{ dayNumber: 1 }, { dayNumber: 2 }, { dayNumber: 3 }, { dayNumber: 4 }] };
        },
      }),
    }),
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        inserted.push(values);
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        updated.push({ table, values });
        return { where: async () => undefined };
      },
    }),
  } as unknown as DbTransaction;
  return { transaction, inserted, updated };
}

it("widens both ends and inserts dates in itinerary order", async () => {
  const { transaction, inserted, updated } = transactionForRange();
  await expect(
    extendTripDateRange(transaction, "trip", "2030-06-10", "2030-06-12", "2030-06-09T15:00:00Z", "2030-06-13T11:00:00Z")
  ).resolves.toEqual({ newStartDate: "2030-06-09", newEndDate: "2030-06-13" });
  expect(inserted).toEqual([
    { tripId: "trip", dayNumber: 1, date: "2030-06-09", label: "Day 1" },
    { tripId: "trip", dayNumber: 5, date: "2030-06-13", label: "Day 5" },
  ]);
  expect(updated.filter((entry) => entry.table === days)).toHaveLength(2);
  expect(updated.find((entry) => entry.table === trips)?.values).toMatchObject({
    startDate: "2030-06-09",
    endDate: "2030-06-13",
  });
});

it("does not write for dates within the range or a range over 45 days", async () => {
  const { transaction, inserted, updated } = transactionForRange();
  await expect(
    extendTripDateRange(transaction, "trip", "2030-06-10", "2030-06-12", "2030-06-11T10:00:00Z", undefined)
  ).resolves.toEqual({});
  await expect(
    extendTripDateRange(transaction, "trip", "2030-06-10", "2030-06-12", "2030-08-01T10:00:00Z", undefined)
  ).rejects.toThrow("Trip cannot exceed 45 days.");
  expect(inserted).toEqual([]);
  expect(updated).toEqual([]);
});
