"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PastTripsList } from "@/components/arrivo/trips-past-list";
import { MobilePastTab } from "@/components/arrivo/trips-mobile-tabs";
import { type Trip } from "@/data/types";

type ViewMode = "cards" | "list";

const VIEW_MODE_KEY = "travel-history-view-mode";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface TravelHistoryListProps {
  trips: Trip[];
  dateFormat: string;
  initialViewMode?: ViewMode;
  onEditTrip: (trip: Trip) => void;
  onDeleteTrip: (trip: Trip) => void;
}

function HistoryEmptyState() {
  return (
    <Empty style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Clock strokeWidth={1.5} />
        </EmptyMedia>
        <EmptyTitle>No past trips yet</EmptyTitle>
        <EmptyDescription>Trips show up here once their dates have passed.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function TravelHistoryList({
  trips,
  dateFormat,
  initialViewMode = "cards",
  onEditTrip,
  onDeleteTrip,
}: TravelHistoryListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  function handleViewMode(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
      document.cookie = `${VIEW_MODE_KEY}=${mode}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    } catch {
      // storage unavailable
    }
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:flex lg:flex-col h-full">
        <div className="flex-1 overflow-y-auto scroll-thin">
          <div className="p-6 flex flex-col gap-6 max-w-[1200px]">
            <div className="flex items-center justify-between">
              <h1
                style={{
                  fontFamily: "var(--font-heading-family, ui-sans-serif)",
                  fontSize: "calc(22px * var(--font-scale))",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "var(--fg)",
                }}
              >
                Travel History
              </h1>
              {trips.length > 0 && (
                <div className="seg">
                  <button
                    className={viewMode === "cards" ? "seg-item active" : "seg-item"}
                    onClick={() => handleViewMode("cards")}
                  >
                    Cards
                  </button>
                  <button
                    className={viewMode === "list" ? "seg-item active" : "seg-item"}
                    onClick={() => handleViewMode("list")}
                  >
                    List
                  </button>
                </div>
              )}
            </div>

            {trips.length === 0 ? (
              <HistoryEmptyState />
            ) : (
              <PastTripsList
                trips={trips}
                dateFormat={dateFormat}
                onEditTrip={onEditTrip}
                onDeleteTrip={onDeleteTrip}
                viewMode={viewMode}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile */}
      <div className="flex flex-col lg:hidden min-h-screen">
        <div className="px-4 pt-12 pb-3" style={{ borderBottom: "1px solid var(--line)" }}>
          <h1
            style={{
              fontFamily: "var(--font-heading-family, ui-sans-serif)",
              fontSize: "calc(26px * var(--font-scale))",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--fg)",
            }}
          >
            Travel History
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto scroll-thin p-4">
          {trips.length === 0 ? (
            <HistoryEmptyState />
          ) : (
            <MobilePastTab trips={trips} dateFormat={dateFormat} onEditTrip={onEditTrip} onDeleteTrip={onDeleteTrip} />
          )}
        </div>
      </div>
    </>
  );
}
