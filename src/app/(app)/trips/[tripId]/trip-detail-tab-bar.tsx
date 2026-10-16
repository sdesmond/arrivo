"use client";

import { TabStatusIcon } from "@/components/arrivo/tab-status-icon";
import { BudgetStatus, TripDetailTab, type TripDetailTab as TripDetailTabValue } from "@/data/types";

export interface TripDetailTabBarProps {
  tabs: { id: TripDetailTabValue; label: string }[];
  activeTab: TripDetailTabValue;
  budgetStatus: BudgetStatus;
  budgetActual: number;
  budgetTotalAmount: number;
  onTabChange: (tab: TripDetailTabValue) => void;
}

export function TripDetailTabBar({
  tabs,
  activeTab,
  budgetStatus,
  budgetActual,
  budgetTotalAmount,
  onTabChange,
}: TripDetailTabBarProps) {
  return (
    <div
      className="flex items-center gap-0 px-4 lg:px-6 shrink-0"
      style={{ borderBottom: "1px solid var(--line)", background: "var(--bg)" }}
    >
      <div className="flex items-center flex-1 gap-0 overflow-x-auto overflow-y-hidden scroll-thin">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            className="h-11 shrink-0 inline-flex flex-row-reverse items-center gap-1 px-3.5 py-3 transition-colors relative"
            style={{
              fontSize: "calc(13px * var(--font-scale))",
              fontWeight: activeTab === tabItem.id ? 600 : 400,
              color: activeTab === tabItem.id ? "var(--fg)" : "var(--fg-3)",
              background: "none",
              border: "none",
              borderBottom: activeTab === tabItem.id ? "2px solid var(--accent-brand)" : "2px solid transparent",
              marginBottom: -1,
            }}
            onClick={() => onTabChange(tabItem.id)}
          >
            {tabItem.label}
            {tabItem.id === TripDetailTab.Budget ? (
              <TabStatusIcon status={budgetStatus} actual={budgetActual} budgetTotal={budgetTotalAmount} />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
