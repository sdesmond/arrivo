import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExpenseTable } from "./expense-table";
import { ExpenseCategory, ReservationType } from "@/data/types";
import type { Expense, Reservation, TripEvent } from "@/data/types";

const { mockRouterPush, mockPathname, mockSearchParams } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockPathname: vi.fn(() => "/trips/trip-1"),
  mockSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: mockRouterPush }),
}));

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    tripId: "trip-1",
    category: ExpenseCategory.Misc,
    amount: 10,
    currency: "USD",
    date: "2026-06-01",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<TripEvent> = {}): TripEvent {
  return { id: "event-1", name: "City Tour", position: 0, ...overrides };
}

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res-1",
    tripId: "trip-1",
    type: ReservationType.Lodging,
    provider: "Grand Hotel",
    ...overrides,
  };
}

describe("ExpenseTable", () => {
  it("renders all expense rows with Date, Title, Category, and Amount columns", () => {
    const expenses = [
      makeExpense({ id: "a", category: ExpenseCategory.Food, amount: 25, date: "2026-06-01", note: "Lunch" }),
      makeExpense({ id: "b", category: ExpenseCategory.Transport, amount: 15, date: "2026-06-02", note: "Taxi" }),
    ];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    expect(screen.getByRole("columnheader", { name: /date/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /title/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /category/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /amount/i })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // 1 header + 2 expense rows
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("Taxi")).toBeInTheDocument();
    expect(screen.getByText("$25.00")).toBeInTheDocument();
    expect(screen.getByText("$15.00")).toBeInTheDocument();
  });

  it("shows event name for event-linked expense", () => {
    const expenses = [makeExpense({ id: "a", eventId: "event-1" })];
    const events = [makeEvent({ id: "event-1", name: "City Tour" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={events}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    expect(screen.getByText("City Tour")).toBeInTheDocument();
  });

  it("shows reservation provider for reservation-linked expense", () => {
    const expenses = [makeExpense({ id: "a", reservationId: "res-1" })];
    const reservations = [makeReservation({ id: "res-1", provider: "Grand Hotel" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={reservations}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    expect(screen.getByText("Grand Hotel")).toBeInTheDocument();
  });

  it("shows note for Misc expense", () => {
    const expenses = [makeExpense({ id: "a", category: ExpenseCategory.Misc, note: "Visa fee" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    expect(screen.getByText("Visa fee")).toBeInTheDocument();
  });

  it("falls back to category label for Misc expense with no note", () => {
    const expenses = [makeExpense({ id: "a", category: ExpenseCategory.Misc, note: undefined })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    // Title falls back to the category label, so "Misc" appears in both the Title and Category cells.
    expect(screen.getAllByText("Misc")).toHaveLength(2);
  });

  it("sorts by date ascending on first Date header click, descending on second", async () => {
    const user = userEvent.setup();
    const expenses = [
      makeExpense({ id: "a", date: "2026-06-05", note: "Later" }),
      makeExpense({ id: "b", date: "2026-06-01", note: "Earlier" }),
    ];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    await user.click(screen.getByRole("columnheader", { name: /date/i }));
    let rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Earlier");
    expect(rows[1]).toHaveTextContent("Later");

    await user.click(screen.getByRole("columnheader", { name: /date/i }));
    rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Later");
    expect(rows[1]).toHaveTextContent("Earlier");
  });

  it("sorts by amount ascending on first Amount header click", async () => {
    const user = userEvent.setup();
    const expenses = [
      makeExpense({ id: "a", amount: 100, note: "Big" }),
      makeExpense({ id: "b", amount: 5, note: "Small" }),
    ];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    await user.click(screen.getByRole("columnheader", { name: /amount/i }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Small");
    expect(rows[1]).toHaveTextContent("Big");
  });

  it("sorts by amount using the trip-currency converted value, not the native amount", async () => {
    const user = userEvent.setup();
    const expenses = [
      // Native amount is large, but converts to a small trip-currency value.
      makeExpense({
        id: "a",
        note: "Big native, small converted",
        amount: 1000,
        currency: "JPY",
        convertedAmountTrip: 6,
        convertedCurrencyTrip: "USD",
      }),
      // Native amount is small, but converts to a large trip-currency value.
      makeExpense({
        id: "b",
        note: "Small native, big converted",
        amount: 5,
        currency: "GBP",
        convertedAmountTrip: 6.5,
        convertedCurrencyTrip: "USD",
      }),
    ];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    await user.click(screen.getByRole("columnheader", { name: /amount/i }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Big native, small converted");
    expect(rows[1]).toHaveTextContent("Small native, big converted");
  });

  it("sorts by category ascending on first Category header click", async () => {
    const user = userEvent.setup();
    const expenses = [
      makeExpense({ id: "a", category: ExpenseCategory.Transport, note: "T" }),
      makeExpense({ id: "b", category: ExpenseCategory.Food, note: "F" }),
    ];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    await user.click(screen.getByRole("columnheader", { name: /category/i }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("F");
    expect(rows[1]).toHaveTextContent("T");
  });

  it("sorts by title ascending on first Title header click", async () => {
    const user = userEvent.setup();
    const expenses = [makeExpense({ id: "a", note: "Zebra" }), makeExpense({ id: "b", note: "Apple" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    await user.click(screen.getByRole("columnheader", { name: /title/i }));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Apple");
    expect(rows[1]).toHaveTextContent("Zebra");
  });

  it("shows sort direction indicator on active column", async () => {
    const user = userEvent.setup();
    const expenses = [makeExpense({ id: "a" }), makeExpense({ id: "b" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    const dateHeader = screen.getByRole("columnheader", { name: /date/i });
    expect(dateHeader).not.toHaveAttribute("aria-sort");

    await user.click(dateHeader);
    expect(dateHeader).toHaveAttribute("aria-sort", "ascending");

    await user.click(dateHeader);
    expect(dateHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("resets sort direction when a different column header is clicked", async () => {
    const user = userEvent.setup();
    const expenses = [makeExpense({ id: "a" }), makeExpense({ id: "b" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    const dateHeader = screen.getByRole("columnheader", { name: /date/i });
    const amountHeader = screen.getByRole("columnheader", { name: /amount/i });

    await user.click(dateHeader);
    await user.click(dateHeader);
    expect(dateHeader).toHaveAttribute("aria-sort", "descending");

    await user.click(amountHeader);
    expect(amountHeader).toHaveAttribute("aria-sort", "ascending");
    expect(dateHeader).not.toHaveAttribute("aria-sort");
  });

  it("returns null when expenses array is empty", () => {
    const { container } = render(
      <ExpenseTable
        expenses={[]}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("row meets h-10 default interactive sizing", () => {
    const expenses = [makeExpense({ id: "a" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveClass("h-10");
  });

  it("formats the date using the provided dateFormat", () => {
    const expenses = [makeExpense({ id: "a", date: "2026-06-01" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        dateFormat="DD/MM/YYYY"
        onEditExpense={vi.fn()}
      />
    );

    expect(screen.getByText("1 Jun 2026")).toBeInTheDocument();
  });

  it("defaults to MM/DD/YYYY display when no dateFormat is provided", () => {
    const expenses = [makeExpense({ id: "a", date: "2026-06-01" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    expect(screen.getByText("Jun 1, 2026")).toBeInTheDocument();
  });

  it("shows only the native amount when the expense currency matches the trip currency", () => {
    const expenses = [makeExpense({ id: "a", amount: 10, currency: "USD" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    expect(screen.getByText("$10.00")).toBeInTheDocument();
  });

  it("shows the trip-currency converted amount alongside the native amount when currencies differ", () => {
    const expenses = [
      makeExpense({ id: "a", amount: 10, currency: "GBP", convertedAmountTrip: 13.4, convertedCurrencyTrip: "USD" }),
    ];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    expect(screen.getByText("£10.00 ($13.40)")).toBeInTheDocument();
  });

  it("omits the converted amount when currencies differ but no conversion has been computed yet", () => {
    const expenses = [makeExpense({ id: "a", amount: 10, currency: "GBP", convertedAmountTrip: undefined })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    expect(screen.getByText("£10.00")).toBeInTheDocument();
  });

  it("navigates to the Itinerary tab with focus param when an event-linked row is clicked", async () => {
    const user = userEvent.setup();
    const expenses = [makeExpense({ id: "a", eventId: "event-1", note: "Tour stop" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[makeEvent({ id: "event-1" })]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    await user.click(screen.getByText("City Tour"));

    expect(mockRouterPush).toHaveBeenCalledWith("?tab=itin&focus=event-1", { scroll: false });
  });

  it("navigates to the Reservations tab with highlight param when a reservation-linked row is clicked", async () => {
    const user = userEvent.setup();
    const expenses = [makeExpense({ id: "a", reservationId: "res-1" })];
    render(
      <ExpenseTable
        expenses={expenses}
        tripId="trip-1"
        events={[]}
        reservations={[makeReservation({ id: "res-1" })]}
        tripCurrency="USD"
        onEditExpense={vi.fn()}
      />
    );

    await user.click(screen.getByText("Grand Hotel"));

    expect(mockRouterPush).toHaveBeenCalledWith("/trips/trip-1?tab=res&highlight=res-1", { scroll: false });
  });

  it("calls onEditExpense when a Misc expense row is clicked", async () => {
    const user = userEvent.setup();
    const onEditExpense = vi.fn();
    const expense = makeExpense({ id: "a", note: "Coffee" });
    render(
      <ExpenseTable
        expenses={[expense]}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={onEditExpense}
      />
    );

    await user.click(screen.getByText("Coffee"));

    expect(onEditExpense).toHaveBeenCalledWith(expense);
  });

  it("activates a row via keyboard (Enter)", async () => {
    const user = userEvent.setup();
    const onEditExpense = vi.fn();
    const expense = makeExpense({ id: "a", note: "Coffee" });
    render(
      <ExpenseTable
        expenses={[expense]}
        tripId="trip-1"
        events={[]}
        reservations={[]}
        tripCurrency="USD"
        onEditExpense={onEditExpense}
      />
    );

    const dataRow = screen.getAllByRole("row")[1];
    dataRow.focus();
    await user.keyboard("{Enter}");

    expect(onEditExpense).toHaveBeenCalledWith(expense);
  });

  describe("keyboard navigation", () => {
    it("moves focus to the next row on ArrowDown", async () => {
      const user = userEvent.setup();
      const expenses = [makeExpense({ id: "a", note: "First" }), makeExpense({ id: "b", note: "Second" })];
      render(
        <ExpenseTable
          expenses={expenses}
          tripId="trip-1"
          events={[]}
          reservations={[]}
          tripCurrency="USD"
          onEditExpense={vi.fn()}
        />
      );

      const rows = screen.getAllByRole("row");
      rows[1].focus();
      await user.keyboard("{ArrowDown}");

      expect(document.activeElement).toBe(rows[2]);
    });

    it("moves focus to the previous row on ArrowUp", async () => {
      const user = userEvent.setup();
      const expenses = [
        makeExpense({ id: "a", note: "First" }),
        makeExpense({ id: "b", note: "Second" }),
        makeExpense({ id: "c", note: "Third" }),
      ];
      render(
        <ExpenseTable
          expenses={expenses}
          tripId="trip-1"
          events={[]}
          reservations={[]}
          tripCurrency="USD"
          onEditExpense={vi.fn()}
        />
      );

      const rows = screen.getAllByRole("row");
      rows[2].focus();
      await user.keyboard("{ArrowUp}");

      expect(document.activeElement).toBe(rows[1]);
    });

    it("does not move past the first row on ArrowUp", async () => {
      const user = userEvent.setup();
      const expenses = [makeExpense({ id: "a", note: "First" }), makeExpense({ id: "b", note: "Second" })];
      render(
        <ExpenseTable
          expenses={expenses}
          tripId="trip-1"
          events={[]}
          reservations={[]}
          tripCurrency="USD"
          onEditExpense={vi.fn()}
        />
      );

      const rows = screen.getAllByRole("row");
      rows[1].focus();
      await user.keyboard("{ArrowUp}");

      expect(document.activeElement).toBe(rows[1]);
    });

    it("moves focus to the first row on Home", async () => {
      const user = userEvent.setup();
      const expenses = [
        makeExpense({ id: "a", note: "First" }),
        makeExpense({ id: "b", note: "Second" }),
        makeExpense({ id: "c", note: "Third" }),
      ];
      render(
        <ExpenseTable
          expenses={expenses}
          tripId="trip-1"
          events={[]}
          reservations={[]}
          tripCurrency="USD"
          onEditExpense={vi.fn()}
        />
      );

      const rows = screen.getAllByRole("row");
      rows[2].focus();
      await user.keyboard("{Home}");

      expect(document.activeElement).toBe(rows[1]);
    });

    it("moves focus to the last row on End", async () => {
      const user = userEvent.setup();
      const expenses = [
        makeExpense({ id: "a", note: "First" }),
        makeExpense({ id: "b", note: "Second" }),
        makeExpense({ id: "c", note: "Third" }),
      ];
      render(
        <ExpenseTable
          expenses={expenses}
          tripId="trip-1"
          events={[]}
          reservations={[]}
          tripCurrency="USD"
          onEditExpense={vi.fn()}
        />
      );

      const rows = screen.getAllByRole("row");
      rows[1].focus();
      await user.keyboard("{End}");

      expect(document.activeElement).toBe(rows[3]);
    });

    it("does not move past the last row on ArrowDown", async () => {
      const user = userEvent.setup();
      const expenses = [makeExpense({ id: "a", note: "First" }), makeExpense({ id: "b", note: "Second" })];
      render(
        <ExpenseTable
          expenses={expenses}
          tripId="trip-1"
          events={[]}
          reservations={[]}
          tripCurrency="USD"
          onEditExpense={vi.fn()}
        />
      );

      const rows = screen.getAllByRole("row");
      rows[2].focus();
      await user.keyboard("{ArrowDown}");

      expect(document.activeElement).toBe(rows[2]);
    });
  });

  describe("resolveTitle fallback", () => {
    it("falls back to category label when eventId has no matching event", () => {
      const expenses = [makeExpense({ id: "a", eventId: "missing-event", category: ExpenseCategory.Food })];
      render(
        <ExpenseTable
          expenses={expenses}
          tripId="trip-1"
          events={[]}
          reservations={[]}
          tripCurrency="USD"
          onEditExpense={vi.fn()}
        />
      );

      expect(screen.getAllByText("Food")).toHaveLength(2);
    });

    it("falls back to category label when reservationId has no matching reservation", () => {
      const expenses = [makeExpense({ id: "a", reservationId: "missing-res", category: ExpenseCategory.Lodging })];
      render(
        <ExpenseTable
          expenses={expenses}
          tripId="trip-1"
          events={[]}
          reservations={[]}
          tripCurrency="USD"
          onEditExpense={vi.fn()}
        />
      );

      expect(screen.getAllByText("Lodging")).toHaveLength(2);
    });
  });
});
