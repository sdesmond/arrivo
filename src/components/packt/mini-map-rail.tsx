"use client";

import { Button } from "@/components/ui/button";
import { RailPanel } from "./rail-panel";

export function MiniMapRail() {
  return (
    <RailPanel header="Today's route" meta="5 STOPS · 8 KM">
      <div className="rounded-[8px] overflow-hidden relative" style={{ height: 120, background: "var(--surface-2)" }}>
        <svg viewBox="0 0 320 120" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {/* Grid lines */}
          {[30, 60, 90].map((yPos) => (
            <line key={yPos} x1="0" y1={yPos} x2="320" y2={yPos} stroke="var(--line)" strokeWidth="0.5" />
          ))}
          {[80, 160, 240].map((xPos) => (
            <line key={xPos} x1={xPos} y1="0" x2={xPos} y2="120" stroke="var(--line)" strokeWidth="0.5" />
          ))}
          {/* Route path */}
          <path
            d="M 40 50 L 90 80 L 150 65 L 200 90 L 270 100"
            fill="none"
            stroke="var(--accent-brand)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="3 5"
            opacity="0.6"
          />
          {/* Pins */}
          {[
            { cx: 40, cy: 50, active: false },
            { cx: 90, cy: 80, active: false },
            { cx: 150, cy: 65, active: true },
            { cx: 200, cy: 90, active: false },
            { cx: 270, cy: 100, active: false },
          ].map((pin, i) => (
            <circle
              key={i}
              cx={pin.cx}
              cy={pin.cy}
              r={pin.active ? 5 : 3.5}
              fill={pin.active ? "var(--accent-brand)" : "var(--surface-3)"}
              stroke={pin.active ? "var(--accent-brand)" : "var(--line-strong)"}
              strokeWidth={1.5}
            />
          ))}
        </svg>
      </div>
      <div
        className="flex items-center justify-between mt-2.5"
        style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)" }}
      >
        <span>
          {"You're at"} <span style={{ fontWeight: 600, color: "var(--fg)" }}>Hamarikyu</span>
        </span>
        <Button variant="outline" size="sm">
          Open map
        </Button>
      </div>
    </RailPanel>
  );
}
