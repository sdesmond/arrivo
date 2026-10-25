// Seed-local shapes for `npm run db:seed` (src/db/seed.ts, src/db/seed-runner.ts, src/db/seed-inserts.ts).
// Deliberately decoupled from the app's render-time types in src/data/types.ts (only the enum unions are
// shared) so seed data can describe DB rows directly without chasing UI-shape churn — see the historical
// note this replaces in the old seed-types.ts.

import type {
  CollaboratorRole,
  DocKind,
  ExpenseCategory,
  InvitationStatus,
  ReservationType,
  TransitMode,
  UserRole,
} from "../../data/types";

export interface SeedLoyaltyNumber {
  programName: string;
  memberNumber: string;
  position: number;
}

export interface SeedWishlistDestination {
  name: string;
  position: number;
}

export interface SeedCompanion {
  name: string;
  age: number;
  position: number;
}

export interface SeedUser {
  /** Stable in-memory handle used to wire shares/invitations — never written to the DB. */
  key: string;
  username: string;
  name: string;
  initials: string;
  currency: string;
  dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY";
  /** Instance authority; omitted means "member". */
  role?: UserRole;
  defaultCoverType?: "photo" | "map" | "graphic";
  warningThreshold?: number;
  dangerThreshold?: number;
  passportNumber?: string;
  passportNationality?: string;
  knownTravelerNumber?: string;
  loyaltyNumbers?: SeedLoyaltyNumber[];
  wishlistDestinations?: SeedWishlistDestination[];
  companions?: SeedCompanion[];
}

export interface SeedItineraryNote {
  position: number;
  content: string;
}

export interface SeedChecklistItem {
  content: string;
  isChecked?: boolean;
}

export interface SeedChecklist {
  position: number;
  title?: string;
  items: SeedChecklistItem[];
}

export interface SeedDay {
  dayNumber: number;
  /**
   * `days.date` is derived by the inserter, never authored here: `seedDate(trip.startOffsetDays + dayNumber - 1)`
   * when the trip has dates, `null` for a dateless trip's placeholder day. This keeps every day's date
   * contiguous with the trip's own offsets and the run date — the same invariant the app relies on for
   * "today" highlighting (day-card.tsx compares `day.date` to `now`, falling back to a `today` flag only
   * when `date` is absent).
   */
  label: string;
  subtitle?: string;
  weather?: string;
  travelSummary?: string;
  notes?: SeedItineraryNote[];
  checklists?: SeedChecklist[];
}

export interface SeedDocument {
  name: string;
  kind: DocKind;
  size?: string;
  url: string;
}

export interface SeedEvent {
  /** In-trip handle used to attach documents/expenses to this event — never written to the DB. */
  key: string;
  name: string;
  /** `null` places the event in the trip's unscheduled section instead of a day. */
  dayNumber: number | null;
  position: number;
  /** "HH:mm" — omit for an untimed event. */
  startTime?: string;
  endTime?: string;
  note?: string;
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  confirmationNumber?: string;
  documents?: SeedDocument[];
}

export interface SeedReservation {
  /** Handle used to attach documents to this reservation — never written to the DB. */
  key: string;
  type: ReservationType;
  provider: string;
  startOffsetDays?: number;
  startTime?: string;
  endOffsetDays?: number;
  endTime?: string;
  startAddress?: string;
  startLocationName?: string;
  endAddress?: string;
  endLocationName?: string;
  confirmationCode?: string;
  notes?: string;
  documents?: SeedDocument[];
}

export interface SeedExpense {
  category: ExpenseCategory;
  amount: number;
  currency: string;
  offsetDays: number;
  eventKey?: string;
  /** When omitted, `convertedAmountTrip`/`convertedAmountProfile` default to `amount` in the trip/owner currency. */
  convertedAmountTrip?: number;
  convertedAmountProfile?: number;
}

export interface SeedPackingList {
  key: string;
  name: string;
  position: number;
}

export interface SeedPackingItem {
  name: string;
  isLabel: boolean;
  done: boolean;
  position: number;
  listKey?: string;
  /** Name of a preceding label item in the same list this item nests under. */
  under?: string;
}

export interface SeedTripNote {
  position: number;
  title?: string;
  body?: string;
}

export interface SeedTrip {
  /** Stable in-memory handle used to wire shares/invitations — never written to the DB. */
  key: string;
  ownerKey: string;
  name: string;
  startOffsetDays: number | null;
  endOffsetDays: number | null;
  destinationName?: string;
  destinationCountry?: string;
  destinationCountryCode?: string;
  budgetCurrency?: string;
  budgetTotal?: number;
  transitMode?: TransitMode;
  days?: SeedDay[];
  events?: SeedEvent[];
  documents?: SeedDocument[];
  reservations?: SeedReservation[];
  expenses?: SeedExpense[];
  packingLists?: SeedPackingList[];
  packingItems?: SeedPackingItem[];
  tripNotes?: SeedTripNote[];
}

export interface SeedShare {
  tripKey: string;
  userKey: string;
  role: CollaboratorRole;
}

export interface SeedInvitation {
  tripKey: string;
  inviteeUserKey: string;
  role: CollaboratorRole;
  status: InvitationStatus;
  /** Relative to the seed run: positive = expires in the future, negative = already expired. */
  expiresInHours: number;
  invitedByUserKey: string;
}

export interface SeedWorld {
  users: SeedUser[];
  trips: SeedTrip[];
  shares: SeedShare[];
  invitations: SeedInvitation[];
}
