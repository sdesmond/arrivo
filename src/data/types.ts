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
  Draft: "draft",
  Upcoming: "upcoming",
  Active: "active",
  Past: "past",
} as const;
export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];

export const ItineraryItemType = {
  Event: "event",
  Checklist: "checklist",
  Note: "note",
} as const;
export type ItineraryItemType = (typeof ItineraryItemType)[keyof typeof ItineraryItemType];

export const CollaboratorRole = {
  Owner: "owner",
  Editor: "editor",
  Viewer: "viewer",
} as const;
export type CollaboratorRole = (typeof CollaboratorRole)[keyof typeof CollaboratorRole];

// kind = the file format
export const DocKind = {
  PDF: "pdf",
  Image: "image",
  Doc: "doc",
} as const;
export type DocKind = (typeof DocKind)[keyof typeof DocKind];

export const TripDetailTab = {
  Itinerary: "itin",
  Map: "map",
  Documents: "docs",
  Packing: "pack",
  Notes: "notes",
} as const;
export type TripDetailTab = (typeof TripDetailTab)[keyof typeof TripDetailTab];

// ─────────────────────────────────────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────────────────────────────────────

export interface LoyaltyNumber {
  id: string;
  programName: string;
  memberNumber: string;
  position: number;
}

export interface WishlistDestination {
  id: string;
  name: string;
  position: number;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  dateFormat: string | null;
  currency: string | null;
  distanceUnit: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  passportNationality: string | null;
  knownTravelerNumber: string | null;
  loyaltyNumbers: LoyaltyNumber[];
  wishlistDestinations: WishlistDestination[];
  companions: Companion[];
}

export interface UpdateUserProfilePatch {
  name?: string;
  dateFormat?: string;
  currency?: string;
  distanceUnit?: string;
  passportNumber?: string | null;
  passportExpiry?: string;
  passportNationality?: string | null;
  knownTravelerNumber?: string | null;
}

export interface AddLoyaltyNumberInput {
  programName: string;
  memberNumber: string;
}

export interface AddWishlistDestinationInput {
  name: string;
}

export interface Companion {
  id: string;
  name: string;
  age?: number;
  passportNumber?: string;
  passportExpiry?: string;
  passportNationality?: string;
  knownTravelerNumber?: string;
  packtUsername?: string;
  position: number;
}

export interface AddCompanionInput {
  name: string;
  age?: number;
}

export interface UpdateCompanionPatch {
  name?: string;
  age?: number;
  passportNumber?: string;
  passportExpiry?: string;
  passportNationality?: string;
  knownTravelerNumber?: string;
  packtUsername?: string;
}

export const ProfileSection = {
  identity: "identity",
  traveler: "traveler",
  companions: "companions",
  preferences: "preferences",
  appearance: "appearance",
  account: "account",
} as const;
export type ProfileSection = (typeof ProfileSection)[keyof typeof ProfileSection];

export const FontSize = {
  small: "small",
  medium: "medium",
  large: "large",
} as const;
export type FontSizeValue = (typeof FontSize)[keyof typeof FontSize];

export const DateFormat = {
  MDY: "MM/DD/YYYY",
  DMY: "DD/MM/YYYY",
} as const;
export type DateFormat = (typeof DateFormat)[keyof typeof DateFormat];

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────

export interface DocPreviewLine {
  text: string;
  // h = heading, m = subheading, b = body, sm = caption, "" = spacer
  level: "h" | "m" | "b" | "sm" | "";
}

export interface Document {
  id: string;
  name: string;
  kind: DocKind;
  size?: string;
  scope: "trip" | "event";
  offline: boolean;
  url?: string;
  previewLines?: DocPreviewLine[];
  addedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTING TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface GeoCoords {
  lat: number;
  lng: number;
}

export interface EventLocation {
  name?: string;
  address?: string;
  geo?: GeoCoords;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIP EVENT
// ─────────────────────────────────────────────────────────────────────────────

export interface TripEvent {
  // ── Identity ──────────────────────────────────────────────────────────────
  id: string;
  tripId?: string;

  // ── Names & descriptions ──────────────────────────────────────────────────
  name: string;
  note?: string;

  // ── Scheduling ────────────────────────────────────────────────────────────
  startAt?: string;
  endAt?: string;

  // ── Location ──────────────────────────────────────────────────────────────
  location?: EventLocation;
  // Flat DB-backed fields (prototype nested location above will be removed in Part 4)
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;

  // ── Cost ──────────────────────────────────────────────────────────────────
  cost?: number;

  // ── Booking reference ─────────────────────────────────────────────────────
  confirmationNumber?: string;

  // ── Attached documents ────────────────────────────────────────────────────
  docs?: Document[];

  position: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKLIST
// ─────────────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  checklistId: string;
  content: string;
  isChecked: boolean;
  createdAt?: string;
}

export interface Checklist {
  id: string;
  tripDayId: string;
  position: number;
  title?: string;
  items: ChecklistItem[];
  createdAt?: string;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITINERARY NOTE
// ─────────────────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  tripDayId: string;
  position: number;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DAY ITINERARY
// ─────────────────────────────────────────────────────────────────────────────

export interface ItineraryNote {
  id: string;
  content: string;
  position: number;
}

export interface DayItinerary {
  id?: string;
  tripId?: string;
  dayNumber: number;
  date?: string;
  label: string;
  subtitle?: string;
  today?: boolean;
  weather?: string;
  travelSummary?: string;
  events: TripEvent[];
  notes?: ItineraryNote[];
  checklists?: Checklist[];
}

// ─────────────────────────────────────────────────────────────────────────────
// COLLABORATOR
// ─────────────────────────────────────────────────────────────────────────────

export interface Collaborator {
  id?: string;
  name: string;
  email: string;
  initials: string;
  role: CollaboratorRole;
  tint?: {
    bg: string;
    fg: string;
  };
  // Flat DB-backed tint fields (nested tint above will be removed in Part 4)
  tintBg?: string;
  tintFg?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIP
// ─────────────────────────────────────────────────────────────────────────────

export interface Budget {
  currency: string;
  total?: number;
  perPerson?: number;
}

export interface Trip {
  id: string;
  status: TripStatus;
  name: string;
  tags?: string[];

  // Canonical ISO dates. Prototype data still stores display strings
  // ("Apr 24", "May 1, 2026"); those will move to a UI formatting layer.
  startDate?: string;
  endDate?: string;

  // Prototype-era computed/display fields — derive from dates in the UI eventually.
  activeDayNumber?: number;
  dayTotal?: number;
  inDays?: number;
  todayDate?: number;
  todayMonth?: string;

  coverImageUrl?: string;
  notes?: string;
  budget?: Budget;

  collaborators?: Collaborator[];

  docs?: Document[];

  createdAt?: string;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKING
// ─────────────────────────────────────────────────────────────────────────────

export interface PackingItem {
  id?: string;
  name: string;
  done: boolean;
  tripId?: string;
  position?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL / THEME HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export interface TripTint {
  hue: number;
  light: string;
  dark: string;
}

export interface WorldPin {
  x: number;
  y: number;
  label: string;
}

// ── Server Action input/patch shapes ─────────────────────────────────────────

export interface TripListEntry {
  trip: Trip; // status computed at read time via getTripStatus(), not stored
  todayEvents: TripEvent[];
}

export interface TripDetailPayload {
  trip: Trip;
  days: DayItinerary[];
  docs: Document[];
  collaborators: Collaborator[];
  packingItems: PackingItem[];
}

export interface NewTripDraft {
  title: string;
  startDate?: string;
  endDate?: string;
  budgetAmount?: string;
}

export interface CreateTripInput {
  name: string;
  startDate?: string; // ISO date "YYYY-MM-DD"
  endDate?: string;
  coverImageUrl?: string;
  notes?: string;
  budgetCurrency?: string;
  budgetTotal?: number;
  budgetPerPerson?: number;
  tags?: string[];
}

export interface UpdateTripPatch {
  name?: string;
  startDate?: string;
  endDate?: string;
  coverImageUrl?: string;
  notes?: string;
  budgetCurrency?: string;
  budgetTotal?: number;
  budgetPerPerson?: number;
  tags?: string[];
}

export interface CreateEventInput {
  name: string;
  startAt?: string; // ISO datetime
  endAt?: string;
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  cost?: number;
  confirmationNumber?: string;
  note?: string;
  afterEventId?: string;
  insertAtPosition?: number;
}

export interface UpdateEventPatch {
  name?: string;
  startAt?: string;
  endAt?: string;
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  cost?: number;
  confirmationNumber?: string;
  note?: string;
}

export type DayItemType = "event" | "note" | "checklist";

export interface ReorderDayItemsInput {
  dayId: string;
  orderedItems: { type: DayItemType; id: string }[];
}

export interface UpdateDayPatch {
  label?: string;
  subtitle?: string;
  weather?: string;
  travelSummary?: string;
}

export interface AddCollaboratorInput {
  email: string;
  name: string;
  initials: string;
  role: "editor" | "viewer";
  tintBg?: string;
  tintFg?: string;
}

export interface AddDocumentInput {
  tripId?: string;
  eventId?: string;
  name: string;
  kind: string;
  size?: string;
  offline?: boolean;
  url?: string;
}

export interface AddPackingItemInput {
  name: string;
}
