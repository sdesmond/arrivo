"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type PackingItem } from "@/data/types";
import { RailPanel } from "./rail-panel";

interface PackingRailProps {
  items: PackingItem[];
}

export function PackingRail({ items }: PackingRailProps) {
  const done = items.filter((p) => p.done).length;
  return (
    <RailPanel header="Packing" meta={`${done} / ${items.length} PACKED`}>
      <div className="flex flex-col gap-0.5">
        {items.slice(0, 6).map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-[6px] px-2 py-1.5"
            style={{ opacity: p.done ? 0.55 : 1 }}
          >
            <span
              className="flex items-center justify-center rounded-full shrink-0"
              style={{
                width: 16,
                height: 16,
                background: p.done ? "var(--accent-brand)" : "var(--surface-2)",
                border: p.done ? "none" : "1.5px solid var(--line-strong)",
                color: p.done ? "#fff" : "transparent",
              }}
            >
              {p.done && <Check size={9} strokeWidth={2.5} />}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--fg)",
                textDecoration: p.done ? "line-through" : "none",
              }}
            >
              {p.name}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 10,
                color: "var(--fg-4)",
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="w-full mt-2">
        Open packing list →
      </Button>
    </RailPanel>
  );
}
