export type {
  TripStatus,
  TripEvent,
  Trip,
  WorldPin,
  TripTint,
} from "./types";

import type { Trip, TripTint, WorldPin, DayItinerary, Collaborator } from "./types";
import { TOKYO_DAYS, TOKYO_DOCS, TOKYO_COLLAB } from "./tokyo";
import { LISBON_DAYS, LISBON_DOCS, LISBON_COLLAB } from "./lisbon";

export const TRIP_TINTS: Record<string, TripTint> = {
  Tokyo:     { hue: 8,   light: "oklch(0.94 0.04 8)",   dark: "oklch(0.28 0.05 8)"   },
  Lisbon:    { hue: 78,  light: "oklch(0.95 0.04 78)",  dark: "oklch(0.30 0.04 78)"  },
  Oaxaca:    { hue: 45,  light: "oklch(0.94 0.05 45)",  dark: "oklch(0.30 0.05 45)"  },
  Reykjavik: { hue: 220, light: "oklch(0.94 0.03 220)", dark: "oklch(0.28 0.04 220)" },
  Marrakech: { hue: 30,  light: "oklch(0.93 0.06 30)",  dark: "oklch(0.30 0.06 30)"  },
  Kyoto:     { hue: 350, light: "oklch(0.94 0.04 350)", dark: "oklch(0.30 0.04 350)" },
  Athens:    { hue: 200, light: "oklch(0.95 0.03 200)", dark: "oklch(0.30 0.04 200)" },
  Hanoi:     { hue: 150, light: "oklch(0.94 0.04 150)", dark: "oklch(0.30 0.04 150)" },
  Patagonia: { hue: 245, light: "oklch(0.94 0.03 245)", dark: "oklch(0.28 0.04 245)" },
  Default:   { hue: 60,  light: "oklch(0.94 0.02 60)",  dark: "oklch(0.30 0.02 60)"  },
};

export const SAMPLE_TOKYO_TRIP: Trip = {
  id: "tokyo-2026",
  name: "Tokyo",
  status: "active",
  startDate: "2026-04-24",
  endDate: "2026-05-01",
  days: 7,
  activeDayNumber: 5,
  dayTotal: 7,
  todayDate: 28,
  todayMonth: "Apr",
  events: [
    { id: "tsukiji", time: "09:30", name: "Tsukiji Outer Market" },
    { id: "teamlab", time: "11:30", name: "teamLab Planets"      },
    { id: "hama",    time: "14:00", name: "Hamarikyu Gardens"    },
    { id: "shibuya", time: "17:30", name: "Shibuya Sky"          },
    { id: "saito",   time: "20:00", name: "Sushi Saito"          },
  ],
};

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

export const ALL_TRIPS: Trip[] = [
  SAMPLE_TOKYO_TRIP,
  { id: "lisbon-2026",    name: "Lisbon",    status: "upcoming", startDate: "2026-05-18", endDate: "2026-05-21", days: 4  },
  { id: "oaxaca-2026",   name: "Oaxaca",    status: "upcoming", startDate: "2026-07-28", endDate: "2026-08-06", days: 9  },
  { id: "reykjavik-2026",name: "Reykjavik", status: "upcoming", startDate: "2026-10-12", endDate: "2026-10-20", days: 8  },
  { id: "marrakech-2026",name: "Marrakech", status: "past",     startDate: "2026-03-01", endDate: "2026-03-06", days: 6  },
  { id: "kyoto-2025",    name: "Kyoto",     status: "past",     startDate: "2025-11-01", endDate: "2025-11-04", days: 4  },
  { id: "athens-2025",   name: "Athens",    status: "past",     startDate: "2025-09-01", endDate: "2025-09-05", days: 5  },
  { id: "hanoi-2025",    name: "Hanoi",     status: "past",     startDate: "2025-05-01", endDate: "2025-05-08", days: 8  },
  { id: "patagonia-2025",name: "Patagonia", status: "past",     startDate: "2025-01-10", endDate: "2025-01-21", days: 12 },
];

export function getTripById(id: string): Trip | undefined {
  return ALL_TRIPS.find((trip) => trip.id === id);
}

export const TRIP_DATA: Record<string, { days: DayItinerary[]; docs: { name: string }[]; collaborators: Collaborator[] }> = {
  "tokyo-2026":  { days: TOKYO_DAYS,  docs: TOKYO_DOCS,  collaborators: TOKYO_COLLAB  },
  "lisbon-2026": { days: LISBON_DAYS, docs: LISBON_DOCS, collaborators: LISBON_COLLAB },
};
