"use client";

import { DeleteTripAlertDialog } from "@/components/packt/delete-trip-alert-dialog";
import { SpendingView } from "@/components/packt/spending-view";
import { TravelHistoryList } from "@/components/packt/travel-history-list";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import {
  CollaboratorRole,
  SpendingDateRange,
  type CurrencyOption,
  type SpendingSummary,
  type TripListEntry,
} from "@/data/types";
import { useTravelHistoryPageHandlers } from "./use-travel-history-page-handlers";

interface TravelHistoryPageClientProps {
  initialEntries: TripListEntry[];
  currencyOptions?: CurrencyOption[];
  nowISO: string;
  dateFormat: string;
  initialViewMode: "cards" | "list";
  initialSummary?: SpendingSummary;
  initialRange?: SpendingDateRange;
  currency?: string;
}

const VIEW_TABS: { id: "trips" | "spending"; label: string }[] = [
  { id: "trips", label: "Trips" },
  { id: "spending", label: "Spending" },
];

const EMPTY_SPENDING_SUMMARY: SpendingSummary = {
  totalSpend: 0,
  averageTripSpend: 0,
  averageDailySpend: null,
  averageTripDuration: null,
  tripCount: 0,
  countedTripCount: 0,
  totalTripDays: 0,
  categoryBreakdown: [],
  destinationBreakdown: [],
  budgetAdherence: { underBudget: 0, onBudget: 0, overBudget: 0 },
};

export function TravelHistoryPageClient({
  initialEntries,
  currencyOptions = [],
  nowISO,
  dateFormat,
  initialViewMode,
  initialSummary,
  initialRange = SpendingDateRange.ThisYear,
  currency = "USD",
}: TravelHistoryPageClientProps) {
  const now = new Date(nowISO);
  const handlers = useTravelHistoryPageHandlers(initialEntries, now);
  const editingTripId = handlers.editingEntry?.trip.id;
  const editingCanManage = handlers.editingEntry?.trip.accessRole === CollaboratorRole.Manager;

  return (
    <>
      <div className="flex flex-col min-h-full">
        <div
          className="flex items-center gap-0 px-4 lg:px-6 shrink-0"
          style={{ borderBottom: "1px solid var(--line)", background: "var(--bg)" }}
        >
          {VIEW_TABS.map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              className="shrink-0 inline-flex items-center gap-1 px-3.5 py-3 transition-colors relative"
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                fontWeight: handlers.activeView === tabItem.id ? 600 : 400,
                color: handlers.activeView === tabItem.id ? "var(--fg)" : "var(--fg-3)",
                background: "none",
                border: "none",
                borderBottom:
                  handlers.activeView === tabItem.id ? "2px solid var(--accent-brand)" : "2px solid transparent",
                marginBottom: -1,
              }}
              onClick={() => handlers.handleViewChange(tabItem.id)}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        <div className="flex-1 p-4 lg:p-6">
          {handlers.activeView === "spending" ? (
            <SpendingView
              initialRange={initialRange}
              initialSummary={initialSummary ?? EMPTY_SPENDING_SUMMARY}
              trips={initialEntries.map((entry) => entry.trip)}
              currency={currency}
              onRangeChange={handlers.handleRangeChange}
            />
          ) : (
            <TravelHistoryList
              trips={handlers.pastTrips}
              dateFormat={dateFormat}
              initialViewMode={initialViewMode}
              onEditTrip={(trip) => handlers.setEditingTrip(trip.id)}
              onDeleteTrip={(trip) => handlers.setDeletingTrip(trip)}
            />
          )}
        </div>
      </div>
      <TripEditSheet
        key={handlers.editingTrip ?? "none"}
        trip={handlers.editingEntry?.trip ?? null}
        currencyOptions={currencyOptions}
        open={handlers.editingTrip !== null}
        onClose={handlers.closeTripEditSheet}
        onSave={async (patch) => {
          if (!handlers.editingTrip) return;
          await handlers.handleTripSave(handlers.editingTrip, patch);
        }}
        saving={handlers.savingTrip}
        dateFormat={dateFormat}
        dateChangeConfirmation={handlers.tripDateConfirmation}
        onResolveDateChange={async (resolution) => {
          await handlers.handleTripSaveResolution(resolution);
        }}
        onCancelDateChange={handlers.cancelTripDateChange}
        canManage={editingCanManage}
        onDelete={editingTripId && editingCanManage ? () => handlers.handleConfirmDeleteTrip(editingTripId) : undefined}
        isDeleting={handlers.isDeleting}
      />
      <DeleteTripAlertDialog
        tripName={handlers.deletingTrip?.name ?? ""}
        open={handlers.deletingTrip !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            handlers.setDeletingTrip(null);
          }
        }}
        onConfirm={() => handlers.handleConfirmDeleteTrip(handlers.deletingTrip?.id)}
        isDeleting={handlers.isDeleting}
      />
    </>
  );
}
