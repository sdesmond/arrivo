"use client";

import { Check, Download, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type DocRailItem, type PackingItem, type Collaborator } from "@/data/types";

function RailPanel({ header, meta, children }: { header: string; meta?: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] overflow-hidden mb-3"
      style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{header}</span>
        {meta && (
          <span
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "9.5px", fontWeight: 500,
              letterSpacing: "0.08em", textTransform: "uppercase",
              color: "var(--fg-3)",
            }}
          >
            {meta}
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function MiniMapRail() {
  return (
    <RailPanel header="Today's route" meta="5 STOPS · 8 KM">
      <div
        className="rounded-[8px] overflow-hidden relative"
        style={{ height: 120, background: "var(--surface-2)" }}
      >
        <svg
          viewBox="0 0 320 120"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          {/* Grid lines */}
          {[30, 60, 90].map((y) => (
            <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="var(--line)" strokeWidth="0.5" />
          ))}
          {[80, 160, 240].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="120" stroke="var(--line)" strokeWidth="0.5" />
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
              cx={pin.cx} cy={pin.cy} r={pin.active ? 5 : 3.5}
              fill={pin.active ? "var(--accent-brand)" : "var(--surface-3)"}
              stroke={pin.active ? "var(--accent-brand)" : "var(--line-strong)"}
              strokeWidth={1.5}
            />
          ))}
        </svg>
      </div>
      <div
        className="flex items-center justify-between mt-2.5"
        style={{ fontSize: 12, color: "var(--fg-3)" }}
      >
        <span>
          You're at{" "}
          <span style={{ fontWeight: 600, color: "var(--fg)" }}>Hamarikyu</span>
        </span>
        <Button variant="outline" size="sm">Open map</Button>
      </div>
    </RailPanel>
  );
}

export function DocsRail({ docs }: { docs: DocRailItem[] }) {
  const offlineCount = docs.filter((d) => d.cached).length;
  return (
    <RailPanel header="Documents" meta={`${offlineCount} / ${docs.length} OFFLINE`}>
      <div className="flex flex-col gap-0.5">
        {docs.slice(0, 5).map((d, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-surface"
            style={{ cursor: "pointer" }}
          >
            <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>
              <FileText size={14} strokeWidth={1.5} />
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--fg)", lineHeight: 1.2 }} className="truncate">
                {d.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{d.type}</div>
            </div>
            {d.cached ? (
              <span style={{ color: "var(--accent-brand)", flexShrink: 0 }}>
                <Check size={15} strokeWidth={2} />
              </span>
            ) : (
              <button style={{ color: "var(--fg-3)", flexShrink: 0 }} title="Save offline">
                <Download size={15} strokeWidth={1.5} />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="w-full mt-2">
        View all {docs.length} documents →
      </Button>
    </RailPanel>
  );
}

export function PackingRail({ items }: { items: PackingItem[] }) {
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
                width: 16, height: 16,
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
                fontSize: 12.5, fontWeight: 500,
                color: "var(--fg)",
                textDecoration: p.done ? "line-through" : "none",
              }}
            >
              {p.name}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 10, color: "var(--fg-4)",
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

export function CollaboratorsRail({ collaborators }: { collaborators: Collaborator[] }) {
  return (
    <RailPanel header="Collaborators" meta={String(collaborators.length)}>
      <div className="flex flex-col gap-1">
        {collaborators.map((c, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-[6px] px-2 py-2">
            <span
              className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
              style={{
                width: 30, height: 30,
                background: c.tint?.bg,
                color: c.tint?.fg,
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 11,
              }}
            >
              {c.initials}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{c.name}</div>
              <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{c.email}</div>
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 10, fontWeight: 500,
                color: "var(--fg-3)",
                letterSpacing: "0.04em",
              }}
            >
              {c.role}
            </span>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="w-full mt-2">
        <Plus size={13} strokeWidth={1.5} />
        Invite
      </Button>
    </RailPanel>
  );
}
