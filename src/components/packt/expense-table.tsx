"use client";

import { useMemo, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Expense, Reservation, TripEvent } from "@/data/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { CATEGORY_LABELS, tripCurrencyAmount } from "@/lib/budget";
import { buildReservationsDeepLinkHref } from "@/app/(app)/trips/[tripId]/trip-detail-tabs";

export interface ExpenseTableProps {
  expenses: Expense[];
  tripId: string;
  events: TripEvent[];
  reservations: Reservation[];
  tripCurrency: string;
  dateFormat?: string;
  onEditExpense: (expense: Expense) => void;
}

type SortColumn = "date" | "title" | "category" | "amount";
type SortDirection = "asc" | "desc";

interface ExpenseRow {
  expense: Expense;
  title: string;
}

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "title", label: "Title" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount" },
];

const GRID_TEMPLATE_COLUMNS = "minmax(90px, 1fr) minmax(140px, 2fr) minmax(110px, 1fr) minmax(90px, 1fr)";

function resolveTitle(expense: Expense, events: TripEvent[], reservations: Reservation[]): string {
  if (expense.eventId) {
    const event = events.find((candidate) => candidate.id === expense.eventId);
    return event?.name ?? CATEGORY_LABELS[expense.category];
  }

  if (expense.reservationId) {
    const reservation = reservations.find((candidate) => candidate.id === expense.reservationId);
    return reservation?.provider ?? CATEGORY_LABELS[expense.category];
  }

  return expense.note?.trim() || CATEGORY_LABELS[expense.category];
}

function formatAmount(expense: Expense, tripCurrency: string): string {
  const native = formatCurrency(expense.amount, expense.currency);

  if (expense.currency.toUpperCase() === tripCurrency.toUpperCase() || expense.convertedAmountTrip === undefined) {
    return native;
  }

  const converted = formatCurrency(expense.convertedAmountTrip, expense.convertedCurrencyTrip ?? tripCurrency);
  return `${native} (${converted})`;
}

function compareRows(left: ExpenseRow, right: ExpenseRow, column: SortColumn): number {
  switch (column) {
    case "date":
      return left.expense.date.localeCompare(right.expense.date);
    case "title":
      return left.title.localeCompare(right.title);
    case "category":
      return CATEGORY_LABELS[left.expense.category].localeCompare(CATEGORY_LABELS[right.expense.category]);
    case "amount":
      return tripCurrencyAmount(left.expense) - tripCurrencyAmount(right.expense);
    default:
      return 0;
  }
}

export function ExpenseTable({
  expenses,
  tripId,
  events,
  reservations,
  tripCurrency,
  dateFormat = "MM/DD/YYYY",
  onEditExpense,
}: ExpenseTableProps): ReactElement | null {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const rows = useMemo<ExpenseRow[]>(
    () => expenses.map((expense) => ({ expense, title: resolveTitle(expense, events, reservations) })),
    [expenses, events, reservations]
  );

  const sortedRows = useMemo(() => {
    if (!sortColumn) {
      return rows;
    }
    const sorted = [...rows].sort((left, right) => compareRows(left, right, sortColumn));
    return sortDirection === "desc" ? sorted.reverse() : sorted;
  }, [rows, sortColumn, sortDirection]);

  if (expenses.length === 0) {
    return null;
  }

  function handleSortClick(column: SortColumn): void {
    if (sortColumn === column) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  function handleRowActivate(expense: Expense): void {
    if (expense.eventId) {
      router.push(`?tab=itin&focus=${expense.eventId}`, { scroll: false });
      return;
    }

    if (expense.reservationId) {
      router.push(
        buildReservationsDeepLinkHref(pathname, searchParams, {
          kind: "highlight",
          reservationId: expense.reservationId,
        }),
        { scroll: false }
      );
      return;
    }

    onEditExpense(expense);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, expense: Expense, index: number): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleRowActivate(expense);
      return;
    }

    const rowElements = document.querySelectorAll<HTMLElement>(
      `[data-trip-id="${tripId}"] [role="row"]:not(:first-child)`
    );

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const nextIndex = Math.min(index + 1, rowElements.length - 1);
        rowElements[nextIndex]?.focus();
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const prevIndex = Math.max(index - 1, 0);
        rowElements[prevIndex]?.focus();
        break;
      }
      case "Home": {
        event.preventDefault();
        rowElements[0]?.focus();
        break;
      }
      case "End": {
        event.preventDefault();
        rowElements[rowElements.length - 1]?.focus();
        break;
      }
    }
  }

  return (
    <div
      role="table"
      aria-label="Expenses"
      data-trip-id={tripId}
      className="overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--line)" }}
    >
      <div
        role="row"
        className="grid"
        style={{
          gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
          borderBottom: "1px solid var(--line)",
          background: "var(--surface-2)",
        }}
      >
        {COLUMNS.map((column) => {
          const isActive = sortColumn === column.key;
          return (
            <button
              key={column.key}
              type="button"
              role="columnheader"
              aria-sort={isActive ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}
              onClick={() => handleSortClick(column.key)}
              className="flex h-10 items-center gap-1 px-4 text-left"
              style={{
                color: "var(--fg-3)",
                fontSize: "calc(12px * var(--font-scale))",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {column.label}
              {isActive ? (
                sortDirection === "asc" ? (
                  <ChevronUp className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                )
              ) : null}
            </button>
          );
        })}
      </div>

      {sortedRows.map(({ expense, title }, index) => (
        <div
          key={expense.id}
          role="row"
          tabIndex={0}
          onClick={() => handleRowActivate(expense)}
          onKeyDown={(event) => handleRowKeyDown(event, expense, index)}
          className={cn(
            "grid h-10 cursor-pointer items-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          )}
          style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS, borderBottom: "1px solid var(--line)" }}
        >
          <span
            role="cell"
            className="truncate px-4"
            style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}
          >
            {formatDate(expense.date, dateFormat)}
          </span>
          <span
            role="cell"
            className="truncate px-4"
            style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg)" }}
          >
            {title}
          </span>
          <span
            role="cell"
            className="truncate px-4"
            style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}
          >
            {CATEGORY_LABELS[expense.category]}
          </span>
          <span
            role="cell"
            className="truncate px-4"
            style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg)" }}
          >
            {formatAmount(expense, tripCurrency)}
          </span>
        </div>
      ))}
    </div>
  );
}
