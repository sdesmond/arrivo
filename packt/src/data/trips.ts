export type {
  EventState,
  EventCategory,
  TripStatus,
  TripEvent,
  Trip,
  WorldPin,
  TripTint,
} from "./types";

export {
  LEGACY_CATEGORY_MAP,
} from "./types";

import type { Trip, TripTint, WorldPin } from "./types";

export const TRIP_TINTS: Record<string, TripTint> = {
  Tokyo:     { hue: 8,   l: "oklch(0.94 0.04 8)",   d: "oklch(0.28 0.05 8)"   },
  Lisbon:    { hue: 78,  l: "oklch(0.95 0.04 78)",  d: "oklch(0.30 0.04 78)"  },
  Oaxaca:    { hue: 45,  l: "oklch(0.94 0.05 45)",  d: "oklch(0.30 0.05 45)"  },
  Reykjavik: { hue: 220, l: "oklch(0.94 0.03 220)", d: "oklch(0.28 0.04 220)" },
  Marrakech: { hue: 30,  l: "oklch(0.93 0.06 30)",  d: "oklch(0.30 0.06 30)"  },
  Kyoto:     { hue: 350, l: "oklch(0.94 0.04 350)", d: "oklch(0.30 0.04 350)" },
  Athens:    { hue: 200, l: "oklch(0.95 0.03 200)", d: "oklch(0.30 0.04 200)" },
  Hanoi:     { hue: 150, l: "oklch(0.94 0.04 150)", d: "oklch(0.30 0.04 150)" },
  Patagonia: { hue: 245, l: "oklch(0.94 0.03 245)", d: "oklch(0.28 0.04 245)" },
  Default:   { hue: 60,  l: "oklch(0.94 0.02 60)",  d: "oklch(0.30 0.02 60)"  },
};

export const SAMPLE_ACTIVE_TRIP: Trip = {
  id: "tokyo-2026",
  name: "Tokyo",
  country: "Japan",
  status: "active",
  startDate: "Apr 24",
  endDate: "May 1, 2026",
  dayN: 5,
  dayTotal: 7,
  collaboratorInitials: ["MR", "JK"],
  todayDate: 28,
  todayMonth: "Apr",
  events: [
    { id: "tsukiji", time: "09:30", name: "Tsukiji Outer Market", cat: "StreetFood", status: "done" },
    { id: "teamlab", time: "11:30", name: "teamLab Planets",      cat: "Museum",     status: "done" },
    { id: "hama",    time: "14:00", name: "Hamarikyu Gardens",    cat: "Park",       status: "now"  },
    { id: "shibuya", time: "17:30", name: "Shibuya Sky",          cat: "Viewpoint",  status: "scheduled" },
    { id: "saito",   time: "20:00", name: "Sushi Saito",          cat: "Restaurant", status: "scheduled" },
  ],
};

export const SAMPLE_UPCOMING: Trip[] = [
  {
    id: "lisbon-2026",
    name: "Lisbon",
    country: "Portugal",
    status: "upcoming",
    startDate: "May 18",
    endDate: "May 22, 2026",
    days: 4,
    inDays: 21,
    collaboratorInitials: ["MR", "AC"],
    docsCount: 7,
  },
  {
    id: "oaxaca-2026",
    name: "Oaxaca",
    country: "Mexico",
    status: "upcoming",
    startDate: "Jul 28",
    endDate: "Aug 6, 2026",
    days: 9,
    inDays: 92,
    collaboratorInitials: ["MR"],
    docsCount: 3,
  },
  {
    id: "reykjavik-2026",
    name: "Reykjavik",
    country: "Iceland",
    status: "upcoming",
    startDate: "Oct 12",
    endDate: "Oct 20, 2026",
    days: 8,
    inDays: 168,
    collaboratorInitials: ["MR", "JK", "AC"],
    docsCount: 0,
  },
];

export const SAMPLE_PAST: Trip[] = [
  { id: "marrakech-2026", name: "Marrakech", country: "Morocco",   status: "past", startDate: "Mar 2026", endDate: "", days: 6 },
  { id: "kyoto-2025",     name: "Kyoto",     country: "Japan",     status: "past", startDate: "Nov 2025", endDate: "", days: 4 },
  { id: "athens-2025",    name: "Athens",    country: "Greece",    status: "past", startDate: "Sep 2025", endDate: "", days: 5 },
  { id: "hanoi-2025",     name: "Hanoi",     country: "Vietnam",   status: "past", startDate: "May 2025", endDate: "", days: 8 },
  { id: "patagonia-2025", name: "Patagonia", country: "Argentina", status: "past", startDate: "Jan 2025", endDate: "", days: 12 },
];

export const WORLD_PINS: WorldPin[] = [
  { x: 760, y: 200, label: "Tokyo"     },
  { x: 750, y: 205, label: "Kyoto"     },
  { x: 770, y: 240, label: "Hanoi"     },
  { x: 470, y: 200, label: "Lisbon"    },
  { x: 540, y: 220, label: "Athens"    },
  { x: 490, y: 260, label: "Marrakech" },
  { x: 270, y: 280, label: "Oaxaca"    },
  { x: 480, y: 130, label: "Reykjavik" },
  { x: 320, y: 410, label: "Patagonia" },
];

export const AVATAR_COLORS: Record<string, { bg: string; color: string }> = {
  MR: { bg: "oklch(0.86 0.08 160)", color: "oklch(0.30 0.10 160)" },
  JK: { bg: "oklch(0.86 0.08 260)", color: "oklch(0.30 0.10 260)" },
  AC: { bg: "oklch(0.86 0.08 45)",  color: "oklch(0.30 0.10 45)"  },
  default: { bg: "oklch(0.86 0.04 220)", color: "oklch(0.30 0.06 220)" },
};
