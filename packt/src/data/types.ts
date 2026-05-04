// =============================================================================
// Canonical data model for Packt.
//
// All domain types live here. Data files import from this module;
// components import types from here or re-exported from their data file.
//
// Naming conventions:
//   - Enums: PascalCase const object + union type (e.g., EventCategory)
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

// "scheduled" replaces the ambiguous "next" — clearly means "not yet started".
// EventState is a backward-compat alias; existing checks like === "done" still work.
export const EventStatus = {
  Scheduled: "scheduled",
  Done:      "done",
  Skipped:   "skipped",
  Cancelled: "cancelled",
} as const;
export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];
export type EventState = EventStatus;

export const EventCategory = {
  // Transport
  Flight:    "Flight",
  Train:     "Train",
  Bus:       "Bus",
  Ferry:     "Ferry",
  Taxi:      "Taxi",
  RentalCar: "RentalCar",
  Transfer:  "Transfer",
  RideShare: "RideShare",

  // Accommodation
  Hotel:   "Hotel",
  Hostel:  "Hostel",
  Airbnb:  "Airbnb",
  Resort:  "Resort",
  Camping: "Camping",

  // Food & Drink
  Restaurant: "Restaurant",
  Cafe:       "Cafe",
  Bar:        "Bar",
  Drinks:     "Drinks",
  StreetFood: "StreetFood",
  Market:     "Market",

  // Culture
  Museum:      "Museum",
  Gallery:     "Gallery",
  Monument:    "Monument",
  HistoricSite:"HistoricSite",
  Show:        "Show",
  Concert:     "Concert",

  // Nature & Outdoor
  Park:      "Park",
  Hike:      "Hike",
  Beach:     "Beach",
  Viewpoint: "Viewpoint",
  Garden:    "Garden",

  // Activity
  Tour:     "Tour",
  Cruise:   "Cruise",
  Sport:    "Sport",
  Shopping: "Shopping",
  Spa:      "Spa",

  // Logistics
  Visa:      "Visa",
  Insurance: "Insurance",
  Currency:  "Currency",
  Packing:   "Packing",

  Other: "Other",
} as const;
export type EventCategory = (typeof EventCategory)[keyof typeof EventCategory];

export const TRANSPORT_CATEGORIES: EventCategory[] = [
  EventCategory.Flight, EventCategory.Train, EventCategory.Bus,
  EventCategory.Ferry, EventCategory.Taxi, EventCategory.RentalCar,
  EventCategory.Transfer, EventCategory.RideShare,
];

export const ACCOMMODATION_CATEGORIES: EventCategory[] = [
  EventCategory.Hotel, EventCategory.Hostel, EventCategory.Airbnb,
  EventCategory.Resort, EventCategory.Camping,
];

export const FOOD_CATEGORIES: EventCategory[] = [
  EventCategory.Restaurant, EventCategory.Cafe, EventCategory.Bar,
  EventCategory.Drinks, EventCategory.StreetFood, EventCategory.Market,
];

export const CULTURE_CATEGORIES: EventCategory[] = [
  EventCategory.Museum, EventCategory.Gallery, EventCategory.Monument,
  EventCategory.HistoricSite, EventCategory.Show, EventCategory.Concert,
];

export const NATURE_CATEGORIES: EventCategory[] = [
  EventCategory.Park, EventCategory.Hike, EventCategory.Beach,
  EventCategory.Viewpoint, EventCategory.Garden,
];

export const ACTIVITY_CATEGORIES: EventCategory[] = [
  EventCategory.Tour, EventCategory.Cruise, EventCategory.Sport,
  EventCategory.Shopping, EventCategory.Spa,
];

export const LOGISTICS_CATEGORIES: EventCategory[] = [
  EventCategory.Visa, EventCategory.Insurance,
  EventCategory.Currency, EventCategory.Packing,
];


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

export const EventPriority = {
  MustDo:   "must-do",
  WantTo:   "want-to",
  Flexible: "flexible",
} as const;
export type EventPriority = (typeof EventPriority)[keyof typeof EventPriority];

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

// type = what the document semantically represents
export const DocType = {
  BoardingPass:          "boarding-pass",
  Voucher:               "voucher",
  FlightTicket:          "flight-ticket",
  HotelConfirmation:     "hotel-confirmation",
  RestaurantReservation: "restaurant-reservation",
  TourTicket:            "tour-ticket",
  TransitTicket:         "transit-ticket",
  Visa:                  "visa",
  Insurance:             "insurance",
  Receipt:               "receipt",
  Map:                   "map",
  GuidePamphlet:         "guide-pamphlet",
  Photo:                 "photo",
  Other:                 "other",
} as const;
export type DocType = (typeof DocType)[keyof typeof DocType];

// For flexible (non-timed) events.
export const TimeBucket = {
  Morning:   "morning",
  Afternoon: "afternoon",
  Evening:   "evening",
  Anytime:   "anytime",
} as const;
export type TimeBucket = (typeof TimeBucket)[keyof typeof TimeBucket];


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
  type:    DocType;
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

export interface Confirmation {
  label: string;
  code:  string;
}

export interface TravelTo {
  mode:    TransportMode;
  detail?: string;
  min?:    number;
}

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface RelativeCoords {
  x: number;
  y: number;
}

export interface EventLocation {
  name?:    string;
  address?: string;
  geo?:     GeoCoords;
  mapPin?:  RelativeCoords;
}

// Only populated for transport-category events (Flight, Train, Ferry, etc.)
export interface TransportDetail {
  origin:        string;
  destination:   string;
  operator?:     string;
  flightNumber?: string;
  terminal?:     string;
  gate?:         string;
  seat?:         string;
  class?:        string;
}


// ─────────────────────────────────────────────────────────────────────────────
// TRIP EVENT — unified replacement for Place, TimedEvent, TripEvent, FlexibleEvent
// ─────────────────────────────────────────────────────────────────────────────

export interface TripEvent {
  // ── Identity ──────────────────────────────────────────────────────────────
  id:      string;
  tripId?: string;

  // ── Classification ────────────────────────────────────────────────────────
  cat:       EventCategory;
  priority?: EventPriority;
  status:    EventStatus;

  // ── Names & descriptions ──────────────────────────────────────────────────
  name:  string;
  sub?:  string;
  note?: string;

  // ── Scheduling ────────────────────────────────────────────────────────────
  // date + time are the prototype-era fields (plain strings).
  // startAt / endAt are ISO datetimes for production use.
  date?:    string;
  time?:    string;
  startAt?: string;
  endAt?:   string;
  durMin?:  number;

  // Flexible/unscheduled events use bucket instead of a fixed time.
  bucket?: TimeBucket;

  // ── Location ──────────────────────────────────────────────────────────────
  location?: EventLocation;

  // ── Transport detail (flights, trains, ferries) ───────────────────────────
  transport?: TransportDetail;

  // ── Getting to the next event ─────────────────────────────────────────────
  travelTo?: TravelTo;

  // ── Booking reference ─────────────────────────────────────────────────────
  confirmation?: Confirmation;

  // ── Attached documents ────────────────────────────────────────────────────
  docs?: Document[];

  createdAt?: string;
  updatedAt?: string;
}


// ─────────────────────────────────────────────────────────────────────────────
// DAY ITINERARY
// ─────────────────────────────────────────────────────────────────────────────

export interface DayItinerary {
  tripId?:   string;
  n:         number;
  date?:     string;
  label:     string;
  subtitle?: string;
  today?:    boolean;
  note?:     string;
  events:    TripEvent[];
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
  country:     string;
  countryCode?: string;
  tags?:        string[];

  // Canonical ISO dates. Prototype data still stores display strings
  // ("Apr 24", "May 1, 2026"); those will move to a UI formatting layer.
  startDate: string;
  endDate:   string;
  timezone?: string;

  // Prototype-era computed/display fields — derive from dates in the UI eventually.
  days?:       number;
  dayN?:       number;
  dayTotal?:   number;
  inDays?:     number;
  todayDate?:  number;
  todayMonth?: string;

  coverImageUrl?: string;
  coverImageAlt?: string;
  notes?:         string;
  budget?:        Budget;

  // collaborators = full Collaborator objects (canonical)
  // collaboratorInitials = legacy string[] avatar display (bridge field)
  collaborators?:        Collaborator[];
  collaboratorInitials?: string[];

  // docs = full Document objects; docsCount = legacy badge number
  docs?:      Document[];
  docsCount?: number;

  // Quick-access strip of today's events shown on the dashboard.
  events?: TripEvent[];

  mapPin?: { x: number; y: number; label: string };

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
  hue: number;
  l:   string;
  d:   string;
}

export interface AvatarTint {
  bg:    string;
  color: string;
}

// UI-only projection generated from Document[]; not a canonical model.
export interface DocRailItem {
  name:   string;
  type:   DocType;
  cached: boolean;
}

export interface WorldPin {
  x:     number;
  y:     number;
  label: string;
}
