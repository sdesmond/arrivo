// =============================================================================
// Canonical data model for Packt.
//
// All domain types live here. Data files import from this module;
// components import types from here or re-exported from their data file.
//
// Naming conventions:
//   - Enums: PascalCase const object + union type (e.g., TripStatus)
//   - ISO 8601 date strings: "YYYY-MM-DD"
//   - ISO 8601 datetime strings: "YYYY-MM-DDTHH:mm:ssZ"
//   - HH:mm time strings: "09:30"
//   - Duration: always in minutes (number)
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export const TripStatus = {
  Draft:    "draft",
  Upcoming: "upcoming",
  Active:   "active",
  Past:     "past",
} as const;
export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];

// Used for the travel-to-next-event connector, not for the event category itself.
export const TransportMode = {
  Walk:      "Walk",
  Subway:    "Subway",
  Train:     "Train",
  Bus:       "Bus",
  Taxi:      "Taxi",
  Rideshare: "Rideshare",
  Ferry:     "Ferry",
  Bike:      "Bike",
  Car:       "Car",
  Other:     "Other",
} as const;
export type TransportMode = (typeof TransportMode)[keyof typeof TransportMode];

export const CollaboratorRole = {
  Owner:  "owner",
  Editor: "editor",
  Viewer: "viewer",
} as const;
export type CollaboratorRole = (typeof CollaboratorRole)[keyof typeof CollaboratorRole];

// kind = the file format
export const DocKind = {
  PDF:   "pdf",
  Image: "image",
  Doc:   "doc",
  Link:  "link",
} as const;
export type DocKind = (typeof DocKind)[keyof typeof DocKind];


// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface DocPreviewLine {
  text:  string;
  // h = heading, m = subheading, b = body, sm = caption, "" = spacer
  level: "h" | "m" | "b" | "sm" | "";
}

export interface Document {
  id:      string;
  name:    string;
  kind:    DocKind;
  size?:   string;
  // trip = belongs to the trip overall; event = attached to one event; both = either
  scope:   "trip" | "event" | "both";
  offline: boolean;
  url?:    string;
  previewLines?: DocPreviewLine[];
  addedAt?: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTING TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TravelTo {
  mode:    TransportMode;
  detail?: string;
  minutes?:    number;
}

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface EventLocation {
  name?:    string;
  address?: string;
  geo?:     GeoCoords;
}


// ─────────────────────────────────────────────────────────────────────────────
// TRIP EVENT
// ─────────────────────────────────────────────────────────────────────────────

export interface TripEvent {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:      string;
  tripId?: string;

  // ── Names & descriptions ──────────────────────────────────────────────────
  name:  string;
  note?: string;

  // ── Scheduling ────────────────────────────────────────────────────────────
  // date + time are the prototype-era fields (plain strings).
  // startAt / endAt are ISO datetimes for production use.
  date?:    string;
  time?:    string;
  endTime?: string;
  startAt?: string;
  endAt?:   string;

  // ── Location ──────────────────────────────────────────────────────────────
  location?: EventLocation;

  // ── Getting to the next event ─────────────────────────────────────────────
  travelTo?: TravelTo;

  // ── Cost ──────────────────────────────────────────────────────────────────
  cost?: number;

  // ── Booking reference ─────────────────────────────────────────────────────
  confirmationNumber?: string;

  // ── Attached documents ────────────────────────────────────────────────────
  docs?: Document[];

  createdAt?: string;
  updatedAt?: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// DAY ITINERARY
// ─────────────────────────────────────────────────────────────────────────────

export interface DayItinerary {
  tripId?:       string;
  dayNumber:     number;
  date?:         string;
  label:         string;
  subtitle?:     string;
  today?:        boolean;
  note?:         string;
  weather?:      string;
  travelSummary?: string;
  events:        TripEvent[];
}


// ─────────────────────────────────────────────────────────────────────────────
// COLLABORATOR
// ─────────────────────────────────────────────────────────────────────────────

export interface Collaborator {
  id?:      string;
  name:     string;
  email:    string;
  initials: string;
  role:     CollaboratorRole;
  tint?: {
    bg: string;
    fg: string;
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// TRIP
// ─────────────────────────────────────────────────────────────────────────────

export interface Budget {
  currency:   string;
  total?:     number;
  perPerson?: number;
}

export interface Trip {
  id:     string;
  status: TripStatus;
  name:   string;
  tags?:  string[];

  // Canonical ISO dates. Prototype data still stores display strings
  // ("Apr 24", "May 1, 2026"); those will move to a UI formatting layer.
  startDate: string;
  endDate:   string;

  // Prototype-era computed/display fields — derive from dates in the UI eventually.
  activeDayNumber?:       number;
  dayTotal?:   number;
  inDays?:     number;
  todayDate?:  number;
  todayMonth?: string;

  coverImageUrl?: string;
  notes?:         string;
  budget?:        Budget;

  collaborators?: Collaborator[];

  docs?: Document[];

  // Quick-access strip of today's events shown on the dashboard.
  events?: TripEvent[];

  createdAt?: string;
  updatedAt?: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// PACKING
// ─────────────────────────────────────────────────────────────────────────────

export interface PackingItem {
  id?:     string;
  name:    string;
  done:    boolean;
  tripId?: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// VISUAL / THEME HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export interface TripTint {
  hue:   number;
  light: string;
  dark:  string;
}

export interface WorldPin {
  x:     number;
  y:     number;
  label: string;
}
