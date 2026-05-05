"use client";

import { useState } from "react";
import {
  Check, MapPin, Coffee, Bed, Camera, Plane, Train, ChevronDown,
  MoreHorizontal, FileText, Edit, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type TripEvent, type Document } from "@/data/types";
import { isEventNow } from "@/lib/utils";

const CAT_ICON: Record<string, React.ReactNode> = {
  // Food & Drink
  StreetFood:  <Coffee size={12} strokeWidth={1.5} />,
  Restaurant:  <Coffee size={12} strokeWidth={1.5} />,
  Cafe:        <Coffee size={12} strokeWidth={1.5} />,
  Bar:         <Coffee size={12} strokeWidth={1.5} />,
  Drinks:      <Coffee size={12} strokeWidth={1.5} />,
  Market:      <Coffee size={12} strokeWidth={1.5} />,
  // Accommodation
  Hotel:       <Bed size={12} strokeWidth={1.5} />,
  Hostel:      <Bed size={12} strokeWidth={1.5} />,
  Airbnb:      <Bed size={12} strokeWidth={1.5} />,
  Resort:      <Bed size={12} strokeWidth={1.5} />,
  // Culture
  Museum:      <Camera size={12} strokeWidth={1.5} />,
  Gallery:     <Camera size={12} strokeWidth={1.5} />,
  Monument:    <Camera size={12} strokeWidth={1.5} />,
  HistoricSite:<Camera size={12} strokeWidth={1.5} />,
  Show:        <Camera size={12} strokeWidth={1.5} />,
  Concert:     <Camera size={12} strokeWidth={1.5} />,
  // Nature & Outdoor
  Park:        <MapPin size={12} strokeWidth={1.5} />,
  Hike:        <MapPin size={12} strokeWidth={1.5} />,
  Beach:       <MapPin size={12} strokeWidth={1.5} />,
  Viewpoint:   <MapPin size={12} strokeWidth={1.5} />,
  Garden:      <MapPin size={12} strokeWidth={1.5} />,
  // Transport
  Flight:      <Plane size={12} strokeWidth={1.5} />,
  Train:       <Train size={12} strokeWidth={1.5} />,
  Bus:         <Train size={12} strokeWidth={1.5} />,
  Ferry:       <Train size={12} strokeWidth={1.5} />,
  Transfer:    <Train size={12} strokeWidth={1.5} />,
};

function DocKindBadge({ kind }: { kind: Document["kind"] }) {
  const map = {
    pdf:   { label: "PDF",  color: "oklch(0.72 0.12 25)"  },
    image: { label: "IMG",  color: "oklch(0.72 0.10 145)" },
    doc:   { label: "DOC",  color: "oklch(0.70 0.10 250)" },
    link:  { label: "LINK", color: "oklch(0.70 0.08 200)" },
  } as const;
  const { label, color } = map[kind] ?? { label: "FILE", color: "oklch(0.70 0.04 250)" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 shrink-0"
      style={{
        fontFamily: "var(--font-mono-family, ui-monospace)",
        fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
        color,
        background: "var(--surface-2)",
        border: `1px solid ${color}44`,
      }}
    >
      <FileText size={10} strokeWidth={1.5} style={{ color }} />
      {label}
    </span>
  );
}

function DocsBlock({ docs }: { docs: Document[] }) {
  return (
    <div className="mt-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <div
        style={{
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: "9.5px", fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--fg-4)", marginBottom: 6,
        }}
      >
        DOCS
      </div>
      <div className="flex flex-col gap-1.5">
        {docs.map((d) => (
          <button
            key={d.id}
            className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-left transition-colors hover:bg-surface-2 w-full"
            style={{ background: "var(--surface)" }}
          >
            <DocKindBadge kind={d.kind} />
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)", lineHeight: 1.2 }} className="truncate">
                {d.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{d.size}</div>
            </div>
            {d.offline ? (
              <span
                className="shrink-0 flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
                style={{ fontSize: 10, color: "var(--accent-ink)", background: "var(--accent-soft)" }}
              >
                <Check size={9} strokeWidth={2} /> Offline
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "var(--fg-4)" }}>↓</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

interface PlaceRowProps {
  place: TripEvent;
  isLast?: boolean;
  onEdit: (event: TripEvent) => void;
}

export function PlaceRow({ place: p, isLast, onEdit }: PlaceRowProps) {
  const [expanded, setExpanded] = useState(() => isEventNow(p));
  const hasDocs = (p.docs?.length ?? 0) > 0;
  const isDone = p.status === "done";
  const isNow = isEventNow(p);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        className="flex items-start gap-3 rounded-[8px] px-3 py-2.5 cursor-pointer transition-colors hover:bg-surface"
        style={{
          opacity: isDone ? 0.7 : 1,
          background: isNow ? "var(--accent-soft)" : undefined,
          border: isNow ? "1px solid var(--accent-brand)" : "1px solid transparent",
        }}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
      >
        {/* Time column */}
        <div
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: 11, fontWeight: 500,
            color: isNow ? "var(--accent-brand)" : "var(--fg-3)",
            width: 56, flexShrink: 0, paddingTop: 1, lineHeight: 1.4,
            letterSpacing: "0.02em",
          }}
        >
          {p.time}
          {isNow && (
            <div style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent-brand)", marginTop: 1 }}>
              NOW
            </div>
          )}
        </div>

        {/* Timeline dot */}
        <div className="flex flex-col items-center shrink-0 pt-1" style={{ width: 16 }}>
          <div
            className="rounded-full flex items-center justify-center shrink-0"
            style={{
              width: 16, height: 16,
              background: isDone
                ? "var(--accent-brand)"
                : isNow
                ? "var(--accent-brand)"
                : "var(--surface-2)",
              border: isDone || isNow
                ? "none"
                : "1.5px solid var(--line-strong)",
              color: isDone || isNow ? "#fff" : "var(--fg-4)",
            }}
          >
            {isDone ? (
              <Check size={9} strokeWidth={2.5} />
            ) : isNow ? (
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", display: "block" }} />
            ) : (
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor", display: "block", opacity: 0.5 }} />
            )}
          </div>
          {!isLast && (
            <div style={{ width: 1, flex: 1, minHeight: 12, background: "var(--line)", marginTop: 2 }} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", lineHeight: 1.2 }}>
            {p.name}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <span
              className="flex items-center gap-1"
              style={{ fontSize: 12, color: "var(--fg-3)" }}
            >
              {CAT_ICON[p.category] ?? <MapPin size={12} strokeWidth={1.5} />}
              {p.category}
            </span>
            {p.subtitle && (
              <span style={{ fontSize: 12, color: "var(--fg-3)" }}>· {p.subtitle}</span>
            )}
            {p.confirmationNumber && (
              <button
                className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:opacity-80"
                style={{
                  fontSize: 11,
                  background: "var(--surface-2)",
                  border: "1px solid var(--line-strong)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard?.writeText(p.confirmationNumber!);
                }}
                title="Click to copy"
              >
                <span style={{ color: "var(--fg-3)" }}>Conf.</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono-family, ui-monospace)",
                    fontSize: 10, fontWeight: 600, color: "var(--fg-2)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {p.confirmationNumber}
                </span>
              </button>
            )}
            {hasDocs && !expanded && (
              <span
                className="flex items-center gap-1 rounded-full px-1.5 py-0.5"
                style={{
                  fontSize: 10, color: "var(--fg-3)",
                  background: "var(--surface-2)",
                }}
              >
                <FileText size={10} strokeWidth={1.5} />
                {p.docs!.length}
              </span>
            )}
          </div>
          {p.note && (
            <div
              className="rounded-[6px] px-2.5 py-1.5 mt-2"
              style={{
                fontSize: 12, color: "var(--fg-2)",
                background: "var(--surface-2)",
                borderLeft: "2px solid var(--accent-brand)",
              }}
            >
              {p.note}
            </div>
          )}
          {expanded && hasDocs && <DocsBlock docs={p.docs!} />}
          {expanded && (
            <div
              className="flex items-center gap-1.5 flex-wrap mt-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              <Button variant="outline" size="sm">
                <MapPin size={12} strokeWidth={1.5} /> Open in map
              </Button>
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(p); }}>
                <Edit size={12} strokeWidth={1.5} /> Edit
              </Button>
              <Button variant="ghost" size="sm">
                <Clock size={12} strokeWidth={1.5} /> Reschedule
              </Button>
              <span className="flex-1" />
              {p.status !== "done" && (
                <Button variant="ghost" size="sm">
                  <Check size={12} strokeWidth={1.5} /> Mark visited
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Right chevron + more */}
        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="rounded-[4px] transition-colors hover:bg-surface-2 flex items-center justify-center"
            style={{ width: 24, height: 24, color: "var(--fg-4)" }}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronDown
              size={14}
              strokeWidth={1.5}
              style={{
                transform: expanded ? "rotate(180deg)" : undefined,
                transition: "transform 0.15s",
              }}
            />
          </button>
          <button
            className="rounded-[4px] transition-colors hover:bg-surface-2 flex items-center justify-center"
            style={{ width: 24, height: 24, color: "var(--fg-4)" }}
          >
            <MoreHorizontal size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Travel connector */}
      {p.travelTo && !isLast && (
        <div
          className="flex items-center gap-2 pl-[88px] py-1"
          style={{ fontSize: 12, color: "var(--fg-3)" }}
        >
          <Train size={12} strokeWidth={1.5} />
          {p.travelTo.mode} · {p.travelTo.detail}
        </div>
      )}
    </div>
  );
}
