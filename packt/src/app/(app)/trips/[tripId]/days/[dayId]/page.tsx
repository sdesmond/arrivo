"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Share2, Plus, MapPin, Clock, Sun,
  Map, Check, Coffee, Camera, Bed, Plane, Package, MoreHorizontal,
  Edit, FileText, Train,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIMED, FLEXIBLE } from "@/data/day-planner";
import type { TripEvent } from "@/data/types";
import { isEventNow } from "@/lib/utils";

// Compute end time string from "HH:mm" + duration in minutes.
function calcEnd(time: string, durMin: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + durMin;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ── Category helpers ──────────────────────────────────────────────────
const CAT_TONE: Record<string, string> = {
  StreetFood:  "oklch(0.78 0.10 60)",
  Restaurant:  "oklch(0.74 0.13 25)",
  Drinks:      "oklch(0.66 0.14 320)",
  Cafe:        "oklch(0.70 0.10 50)",
  Bar:         "oklch(0.66 0.14 320)",
  Museum:      "oklch(0.75 0.09 280)",
  Gallery:     "oklch(0.75 0.09 280)",
  HistoricSite:"oklch(0.75 0.09 280)",
  Show:        "oklch(0.75 0.09 280)",
  Viewpoint:   "oklch(0.74 0.10 220)",
  Park:        "oklch(0.75 0.10 145)",
  Garden:      "oklch(0.75 0.10 145)",
  Tour:        "oklch(0.75 0.10 145)",
  Shopping:    "oklch(0.78 0.08 30)",
};
const catTone = (cat: string) => CAT_TONE[cat] ?? "oklch(0.75 0.06 250)";

function CatIcon({ cat, size = 12 }: { cat: string; size?: number }) {
  const sw = 1.5;
  if (["StreetFood", "Restaurant", "Cafe", "Drinks", "Bar"].includes(cat)) return <Coffee size={size} strokeWidth={sw} />;
  if (["Museum", "Gallery", "HistoricSite", "Viewpoint", "Show", "Concert"].includes(cat)) return <Camera size={size} strokeWidth={sw} />;
  if (["Park", "Garden", "Hike", "Beach", "Tour", "Cruise"].includes(cat)) return <MapPin size={size} strokeWidth={sw} />;
  if (["Flight"].includes(cat)) return <Plane size={size} strokeWidth={sw} />;
  if (["Train", "Bus", "Ferry", "Transfer"].includes(cat)) return <Train size={size} strokeWidth={sw} />;
  if (cat === "Hotel" || cat === "Hostel" || cat === "Airbnb") return <Bed size={size} strokeWidth={sw} />;
  if (cat === "Shopping") return <Package size={size} strokeWidth={sw} />;
  return <MapPin size={size} strokeWidth={sw} />;
}

// ── Timed event row ───────────────────────────────────────────────────
function TimedRow({ ev, index, isOpen, onToggle, isPulsed }: {
  ev: TripEvent;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  isPulsed?: boolean;
}) {
  const isDone = ev.status === "done";
  const isNow = isEventNow(ev);
  const hasDocs = (ev.docs?.length ?? 0) > 0;
  const endTime = ev.time && ev.durMin != null ? calcEnd(ev.time, ev.durMin) : null;

  return (
    <div>
      {/* Travel connector (shown above each non-first event) */}
      {ev.travelTo && (
        <div
          className="flex items-center gap-2 pl-[80px] py-1.5"
          style={{ fontSize: 12, color: isDone ? "var(--fg-4)" : "var(--fg-3)" }}
        >
          <div style={{ width: 1, height: 16, background: "var(--line)", marginRight: 4 }} />
          <Train size={11} strokeWidth={1.5} />
          <span style={{ opacity: isDone ? 0.6 : 1 }}>
            {ev.travelTo.mode} · {ev.travelTo.min} min
            {!isDone && <span style={{ color: "var(--fg-4)" }}> · {ev.travelTo.detail}</span>}
          </span>
          {isDone && <Check size={10} strokeWidth={2} style={{ color: "var(--accent-brand)" }} />}
        </div>
      )}

      {/* Event card */}
      <div
        className="flex items-start gap-3"
        data-event-id={ev.id}
        style={{ outline: isPulsed ? "2px solid var(--accent-brand)" : undefined, borderRadius: 10, transition: "outline 0.3s" }}
      >
        {/* Time column */}
        <div
          className="shrink-0 text-right"
          style={{
            width: 68,
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: 11, paddingTop: 12, lineHeight: 1.3,
            color: isNow ? "var(--accent-brand)" : "var(--fg-3)",
          }}
        >
          <div style={{ fontWeight: 600 }}>{ev.time}</div>
          {ev.durMin != null && <div style={{ fontSize: 10, opacity: 0.7 }}>{ev.durMin}m</div>}
          {endTime && <div style={{ fontSize: 10, opacity: 0.55 }}>→ {endTime}</div>}
        </div>

        {/* Rail + dot */}
        <div className="flex flex-col items-center shrink-0" style={{ width: 16 }}>
          <div style={{ width: 1, height: 8, background: "var(--line)" }} />
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 16, height: 16,
              background: isDone ? "var(--accent-brand)" : isNow ? "var(--accent-brand)" : "var(--surface-2)",
              border: isDone || isNow ? "none" : "1.5px solid var(--line-strong)",
              color: isDone || isNow ? "#fff" : "var(--fg-4)",
            }}
          >
            {isDone ? (
              <Check size={9} strokeWidth={2.5} />
            ) : isNow ? (
              <span className="pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", display: "block" }} />
            ) : (
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor", display: "block", opacity: 0.4 }} />
            )}
          </div>
          <div style={{ width: 1, flex: 1, minHeight: 8, background: "var(--line)" }} />
        </div>

        {/* Card */}
        <div
          className="flex-1 min-w-0 rounded-[8px] mb-0 cursor-pointer transition-colors"
          style={{
            background: isNow ? "var(--accent-soft)" : "var(--surface)",
            border: isNow ? "1.5px solid var(--accent-brand)" : "1px solid var(--line)",
            opacity: isDone ? 0.75 : 1,
            marginBottom: 2,
          }}
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        >
          {/* Card head */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span
              className="flex items-center justify-center rounded-[4px] shrink-0"
              style={{
                width: 20, height: 20,
                background: "var(--surface-2)",
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 10, fontWeight: 700, color: "var(--fg-3)",
              }}
            >
              {index + 1}
            </span>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--fg)" }} className="truncate">
              {ev.name}
            </div>
            <span className="flex items-center gap-1 shrink-0" style={{ fontSize: 11.5, color: catTone(ev.cat) }}>
              <CatIcon cat={ev.cat} size={11} />
              {ev.cat}
            </span>
            {isNow && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5"
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  background: "var(--accent-brand)", color: "#fff",
                }}
              >
                NOW
              </span>
            )}
            <ChevronRight
              size={13}
              strokeWidth={1.5}
              style={{
                color: "var(--fg-4)", flexShrink: 0,
                transform: isOpen ? "rotate(90deg)" : undefined,
                transition: "transform 0.15s",
              }}
            />
          </div>

          {/* Meta row */}
          <div
            className="flex items-center gap-3 px-3 pb-2.5 flex-wrap"
            style={{ fontSize: 12, color: "var(--fg-3)" }}
          >
            {ev.location?.name && (
              <span className="flex items-center gap-1">
                <MapPin size={11} strokeWidth={1.5} />
                {ev.location.name}
              </span>
            )}
            {ev.confirmationNumber && (
              <button
                className="flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{
                  fontSize: 10.5, background: "var(--surface-2)",
                  border: "1px solid var(--line-strong)",
                }}
                onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(ev.confirmationNumber!); }}
                title="Click to copy"
              >
                <span style={{ color: "var(--fg-3)" }}>Conf.</span>
                <span style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontWeight: 600, color: "var(--fg-2)",
                }}>
                  {ev.confirmationNumber}
                </span>
              </button>
            )}
            {hasDocs && !isOpen && (
              <span className="flex items-center gap-1 rounded-full px-1.5 py-0.5" style={{ fontSize: 10, background: "var(--surface-2)" }}>
                <FileText size={10} strokeWidth={1.5} />
                {ev.docs!.length}
              </span>
            )}
          </div>

          {/* Expanded body */}
          {isOpen && (
            <div
              className="px-3 pb-3"
              style={{ borderTop: "1px solid var(--line)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {ev.note && (
                <div
                  className="rounded-[6px] px-2.5 py-2 mt-3 mb-2"
                  style={{
                    fontSize: 12.5, color: "var(--fg-2)",
                    background: "var(--surface-2)",
                    borderLeft: "2px solid var(--accent-brand)",
                  }}
                >
                  <div style={{
                    fontFamily: "var(--font-mono-family, ui-monospace)",
                    fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: "var(--fg-4)", marginBottom: 4,
                  }}>
                    NOTE
                  </div>
                  {ev.note}
                </div>
              )}
              {hasDocs && (
                <div className="mt-2">
                  <div style={{
                    fontFamily: "var(--font-mono-family, ui-monospace)",
                    fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: "var(--fg-4)", marginBottom: 6,
                  }}>
                    DOCS
                  </div>
                  <div className="flex flex-col gap-1">
                    {ev.docs!.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-surface-2 cursor-pointer" style={{ background: "var(--surface)" }}>
                        <FileText size={13} strokeWidth={1.5} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
                        <div className="flex-1 min-w-0">
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }} className="truncate">{d.name}</div>
                          <div style={{ fontSize: 10.5, color: "var(--fg-4)" }}>{d.size}</div>
                        </div>
                        {d.offline && (
                          <span className="shrink-0 flex items-center gap-0.5 rounded-full px-1.5 py-0.5" style={{ fontSize: 10, color: "var(--accent-ink)", background: "var(--accent-soft)" }}>
                            <Check size={8} strokeWidth={2.5} /> Offline
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1.5 flex-wrap mt-3">
                <Button variant="outline" size="sm">
                  <MapPin size={12} strokeWidth={1.5} /> Open in map
                </Button>
                <Button variant="outline" size="sm">
                  <Edit size={12} strokeWidth={1.5} /> Edit
                </Button>
                <Button variant="ghost" size="sm">
                  <Clock size={12} strokeWidth={1.5} /> Reschedule
                </Button>
                <span className="flex-1" />
                {ev.status !== "done" && (
                  <Button variant="ghost" size="sm">
                    <Check size={12} strokeWidth={1.5} /> Mark visited
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Flexible section ──────────────────────────────────────────────────
type BucketFilter = "all" | "morning" | "afternoon" | "evening";

function FlexibleSection() {
  const [bucket, setBucket] = useState<BucketFilter>("all");
  const buckets: { id: BucketFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "morning", label: "Morning" },
    { id: "afternoon", label: "Afternoon" },
    { id: "evening", label: "Evening" },
  ];
  const list = bucket === "all" ? FLEXIBLE : FLEXIBLE.filter((x) => x.bucket === bucket);

  return (
    <div className="mb-4">
      <div
        className="flex items-center justify-between gap-2 mb-2"
        style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg-2)" }}>
          Flexible · no fixed time
        </span>
        <div className="flex items-center gap-0.5">
          {buckets.map((b) => (
            <button
              key={b.id}
              className="px-2.5 py-1 rounded-[6px] transition-colors text-xs"
              style={{
                fontWeight: bucket === b.id ? 600 : 400,
                color: bucket === b.id ? "var(--fg)" : "var(--fg-3)",
                background: bucket === b.id ? "var(--surface-2)" : "transparent",
                border: "none",
              }}
              onClick={() => setBucket(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {list.map((p) => (
          <FlexCard key={p.id} ev={p} />
        ))}
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-[6px] transition-colors"
          style={{ fontSize: 12.5, color: "var(--fg-4)", border: "1px dashed var(--line-strong)", background: "none" }}
        >
          <Plus size={13} strokeWidth={1.5} />
          Add flexible place
        </button>
      </div>
    </div>
  );
}

function FlexCard({ ev }: { ev: TripEvent }) {
  const bucketColor: Record<string, string> = {
    morning:   "oklch(0.78 0.10 60)",
    afternoon: "oklch(0.74 0.10 220)",
    evening:   "oklch(0.66 0.14 320)",
  };
  return (
    <div
      className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 transition-colors"
      style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
    >
      <div
        className="shrink-0 rounded-[4px] px-1.5 py-0.5"
        style={{
          fontFamily: "var(--font-mono-family, ui-monospace)",
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          color: ev.bucket ? bucketColor[ev.bucket] : "var(--fg-3)",
          textTransform: "uppercase",
        }}
      >
        {ev.bucket}
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{ev.name}</div>
        <div className="flex items-center gap-1" style={{ fontSize: 11.5, color: catTone(ev.cat) }}>
          <CatIcon cat={ev.cat} size={11} />
          {ev.cat}
          {ev.location?.name && (
            <span style={{ color: "var(--fg-3)" }}>· {ev.location.name}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button className="flex items-center justify-center rounded-[4px] transition-colors hover:bg-surface-2" style={{ width: 26, height: 26, color: "var(--fg-3)" }} title="Schedule">
          <Clock size={13} strokeWidth={1.5} />
        </button>
        <button className="flex items-center justify-center rounded-[4px] transition-colors hover:bg-surface-2" style={{ width: 26, height: 26, color: "var(--fg-3)" }} title="More">
          <MoreHorizontal size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────
export default function DayPlannerPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [openId, setOpenId] = useState<string | null>(focusId ?? "hama");
  const [pulseId, setPulseId] = useState<string | null>(focusId);
  const timelineRef = useRef<HTMLDivElement>(null);

  const onToggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  useEffect(() => {
    if (!focusId) return;
    setOpenId(focusId);
    setPulseId(focusId);
    const timer = setTimeout(() => {
      const el = timelineRef.current?.querySelector(`[data-event-id="${focusId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const clearPulse = setTimeout(() => setPulseId(null), 1400);
    return () => { clearTimeout(timer); clearTimeout(clearPulse); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Crumb + day row */}
      <div
        className="shrink-0 px-4 lg:px-6 py-2.5"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 mb-2">
          <Link
            href="/trips"
            className="inline-flex items-center gap-1 text-[0.8rem] font-medium h-7 px-2 rounded-[8px] transition-colors hover:bg-muted"
            style={{ color: "var(--fg-3)" }}
          >
            <ChevronLeft size={13} strokeWidth={1.5} />
            Trip
          </Link>
          <span style={{ color: "var(--fg-4)", fontSize: 12 }}>/</span>
          <Link
            href="/trips/tokyo-2026"
            className="text-[0.8rem] font-medium h-7 px-2 rounded-[8px] transition-colors hover:bg-muted inline-flex items-center"
            style={{ color: "var(--fg-3)" }}
          >
            Tokyo
          </Link>
          <span style={{ color: "var(--fg-4)", fontSize: 12 }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>Day 5</span>
          <span className="flex-1" />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Share2 size={13} strokeWidth={1.5} /> Share day
            </Button>
            <Button variant="outline" size="sm">
              <Plus size={13} strokeWidth={1.5} /> Add place
            </Button>
          </div>
        </div>

        {/* Day row */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            className="flex items-center justify-center rounded-[8px] transition-colors hover:bg-surface-2"
            style={{ width: 30, height: 30, color: "var(--fg-3)" }}
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <div>
            <div
              style={{
                fontFamily: "var(--font-heading-family, ui-sans-serif)",
                fontSize: 17, fontWeight: 700, color: "var(--fg)",
              }}
            >
              Friday, April 28
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--accent-brand)",
              }}
            >
              DAY 5 · TODAY · TOKYO BAY
            </div>
          </div>
          <span className="flex-1" />
          <div className="hidden lg:flex items-center gap-3" style={{ fontSize: 12, color: "var(--fg-3)" }}>
            <span className="flex items-center gap-1"><MapPin size={12} strokeWidth={1.5} />5 stops</span>
            <span className="flex items-center gap-1"><Clock size={12} strokeWidth={1.5} />09:30 – 22:00</span>
            <span className="flex items-center gap-1" style={{ color: "var(--accent-brand)" }}>
              <Sun size={12} strokeWidth={1.5} />22° · partly cloudy
            </span>
            <span
              className="flex items-center gap-1 rounded-full px-2 py-0.5"
              style={{ background: "var(--surface-2)", fontWeight: 500 }}
            >
              <Map size={11} strokeWidth={1.5} />~14 km · 1h 5m
            </span>
          </div>
          <button
            className="flex items-center justify-center rounded-[8px] transition-colors hover:bg-surface-2"
            style={{ width: 30, height: 30, color: "var(--fg-3)" }}
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left: timeline column */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
          {/* Day note */}
          <div
            className="rounded-[8px] px-4 py-3 mb-5"
            style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: "var(--fg-4)",
                }}
              >
                DAY NOTES
              </span>
              <Button variant="ghost" size="sm">
                <Edit size={11} strokeWidth={1.5} /> Edit note
              </Button>
            </div>
            <p style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.6 }}>
              Easy day — Bay area mostly walkable. Carry portable charger. Sushi Saito is the splurge tonight, dress smart-casual. Trains slow after 23:00 so plan return from Roppongi.
            </p>
          </div>

          {/* Flexible section */}
          <FlexibleSection />

          {/* Timed events */}
          <div
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: 9.5, fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--fg-4)",
              marginBottom: 12,
            }}
          >
            TIMED EVENTS
          </div>
          <div className="flex flex-col" ref={timelineRef}>
            {TIMED.map((ev, i) => (
              <TimedRow
                key={ev.id}
                ev={ev}
                index={i}
                isOpen={openId === ev.id}
                onToggle={() => onToggle(ev.id)}
                isPulsed={pulseId === ev.id}
              />
            ))}
          </div>
        </div>


      </div>
    </div>
  );
}
