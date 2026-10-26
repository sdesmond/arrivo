// =============================================================================
// Canonical data model for Arrivo.
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
  Manager: "manager",
  Editor: "editor",
  Viewer: "viewer",
} as const;
export type CollaboratorRole = (typeof CollaboratorRole)[keyof typeof CollaboratorRole];

export const UserRole = {
  Admin: "admin",
  Member: "member",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface BootstrapAccountValues {
  username: string;
  name: string;
  passwordHash: string;
  currency?: string | null;
}

export type BootstrapResult = { ok: true; userId: string; username: string } | { ok: false; reason: "closed" };

export const ActivityEventType = {
  SignIn: "sign_in",
  /** The target is the attempted account, never an authenticated actor. */
  SignInFailed: "sign_in_failed",
  SignOut: "sign_out",
  AccountCreated: "account_created",
  RoleChanged: "role_changed",
  UsernameChanged: "username_changed",
  PasswordChanged: "password_changed",
  AccountDeleted: "account_deleted",
  /** Summary only: one row per burst of trip edits, merged by `src/lib/activity-batches.ts`. */
  TripUpdated: "trip_updated",
} as const;
export type ActivityEventType = (typeof ActivityEventType)[keyof typeof ActivityEventType];

/** Stable account ID plus the username at the time of the event; Activity has no foreign keys. */
export interface ActivityIdentity {
  id: string;
  username: string;
}

/**
 * The account an event is about. `id` set = a known account; `id` null with a username = a supplied name that matched
 * no account; omit the target entirely when no safe identity is available.
 */
export interface ActivityTarget {
  id: string | null;
  username: string;
}

export interface ActivityEventInput {
  type: ActivityEventType;
  /** Null only where nobody is authenticated: failed sign-ins, and a sign-out whose identity could not be read. */
  actor: ActivityIdentity | null;
  /** The account acted upon, when different from the actor. */
  target?: ActivityTarget;
  tripId?: string;
}

/** Trip summaries are partitioned by actor, so they always have one. */
export type ActivityBatchInput = ActivityEventInput & { actor: ActivityIdentity };

/** Safe read shape: no IPs, tokens, URLs or credentials. */
export interface ActivityEventSummary {
  id: string;
  type: ActivityEventType;
  actorUsername: string | null;
  /** The affected account's username when one was recorded; `targetKnown` is false for a name that matched no account. */
  targetUsername?: string;
  targetKnown?: boolean;
  /** ISO 8601 UTC. */
  occurredAt: string;
  tripId?: string;
}

export interface InstanceUserSummary {
  id: string;
  username: string;
  role: UserRole;
  setupComplete: boolean;
  isLastCompletedAdmin: boolean;
}

export const RoleChangeFailure = {
  Forbidden: "forbidden",
  NotFound: "not-found",
  InstanceUnavailable: "instance-unavailable",
  LastAdmin: "last-admin",
  UnfinishedAccount: "unfinished-account",
  InvalidRole: "invalid-role",
  Retry: "retry",
} as const;
export type RoleChangeFailure = (typeof RoleChangeFailure)[keyof typeof RoleChangeFailure];

export interface ChangeUserRoleInput {
  targetUserId: string;
  role: UserRole;
}

// `changed` is false when the target already held the requested role.
export type ChangeUserRoleResult =
  | { ok: true; userId: string; role: UserRole; changed: boolean }
  | { ok: false; reason: RoleChangeFailure };

/** What the service returns: the client-facing result plus usernames read under the lock, for the post-commit event. */
export type ChangeUserRoleOutcome =
  | (Extract<ChangeUserRoleResult, { ok: true }> & { actor: ActivityIdentity; target: ActivityIdentity })
  | Extract<ChangeUserRoleResult, { ok: false }>;

export const InvitationStatus = {
  Pending: "pending",
  Accepted: "accepted",
  Declined: "declined",
  Expired: "expired",
  Rescinded: "rescinded",
} as const;
export type InvitationStatus = (typeof InvitationStatus)[keyof typeof InvitationStatus];

// kind = the file format
export const DocKind = {
  PDF: "pdf",
  Image: "image",
  Doc: "doc",
} as const;
export type DocKind = (typeof DocKind)[keyof typeof DocKind];

export const CoverType = {
  Photo: "photo",
  Map: "map",
  Graphic: "graphic",
} as const;
export type CoverType = (typeof CoverType)[keyof typeof CoverType];

export const TransitMode = {
  Walk: "walk",
  Drive: "drive",
  Transit: "transit",
} as const;
export type TransitMode = (typeof TransitMode)[keyof typeof TransitMode];

export type DayRouteSummary =
  | { status: "loading" }
  | { status: "ready"; totalDistanceMeters: number; totalDurationSeconds: number; hopCount: number }
  | { status: "unavailable" };

export interface ScheduleConflict {
  eventIndex: number;
  previousEventId: string;
  currentEventId: string;
  travelTimeSeconds: number;
  scheduledGapSeconds: number;
}

export interface LocatedItemPin {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  reservationType?: ReservationType;
}

export const ExpenseCategory = {
  Food: "food",
  Lodging: "lodging",
  Transport: "transport",
  Activity: "activity",
  Sightseeing: "sightseeing",
  Gas: "gas",
  Groceries: "groceries",
  Flights: "flights",
  CarRental: "car-rental",
  Shopping: "shopping",
  Misc: "misc",
} as const;
export type ExpenseCategory = (typeof ExpenseCategory)[keyof typeof ExpenseCategory];

export const BudgetStatus = {
  Neutral: "neutral",
  Warning: "warning",
  Danger: "danger",
} as const;
export type BudgetStatus = (typeof BudgetStatus)[keyof typeof BudgetStatus];

export const TripDetailTab = {
  Itinerary: "itin",
  Budget: "budget",
  Map: "map",
  Documents: "docs",
  Packing: "pack",
  Notes: "notes",
  Reservations: "res",
} as const;
export type TripDetailTab = (typeof TripDetailTab)[keyof typeof TripDetailTab];

export const SpendingDateRange = {
  ThisYear: "this-year",
  LastYear: "last-year",
  Last12Months: "last-12-months",
  AllTime: "all-time",
} as const;
export type SpendingDateRange = (typeof SpendingDateRange)[keyof typeof SpendingDateRange];

export interface SpendingSummary {
  totalSpend: number;
  averageTripSpend: number;
  averageDailySpend: number | null;
  averageTripDuration: number | null;
  tripCount: number;
  countedTripCount: number;
  totalTripDays: number;
  categoryBreakdown: { category: ExpenseCategory; total: number; count: number }[];
  destinationBreakdown: { countryCode: string | null; countryName: string; total: number }[];
  budgetAdherence: { underBudget: number; onBudget: number; overBudget: number };
}

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
  username: string;
  dateFormat: string | null;
  currency: string | null;
  distanceUnit: string | null;
  transitMode?: TransitMode | null;
  walkThresholdMeters?: number | null;
  passportNumber: string | null;
  passportExpiry: string | null;
  passportNationality: string | null;
  knownTravelerNumber: string | null;
  defaultCoverType?: CoverType;
  warningThreshold: number;
  dangerThreshold: number;
  loyaltyNumbers: LoyaltyNumber[];
  wishlistDestinations: WishlistDestination[];
  companions: Companion[];
}

export interface UpdateUserProfilePatch {
  name?: string;
  username?: string;
  dateFormat?: string;
  currency?: string;
  distanceUnit?: string;
  transitMode?: TransitMode | null;
  walkThresholdMeters?: number | null;
  defaultCoverType?: CoverType;
  passportNumber?: string | null;
  passportExpiry?: string;
  passportNationality?: string | null;
  knownTravelerNumber?: string | null;
  warningThreshold?: number;
  dangerThreshold?: number;
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
  username?: string;
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
  username?: string;
}

export const ProfileSection = {
  identity: "identity",
  traveler: "traveler",
  companions: "companions",
  preferences: "preferences",
  appearance: "appearance",
  security: "security",
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
  scope: "trip" | "event" | "reservation";
  url?: string;
  previewLines?: DocPreviewLine[];
  addedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESERVATION
// ─────────────────────────────────────────────────────────────────────────────

export const ReservationType = {
  Flight: "flight",
  Train: "train",
  Bus: "bus",
  Ferry: "ferry",
  RentalCar: "rental-car",
  Lodging: "lodging",
  Cruise: "cruise",
  Other: "other",
} as const;
export type ReservationType = (typeof ReservationType)[keyof typeof ReservationType];

export interface Reservation {
  id: string;
  tripId: string;
  type: ReservationType;
  provider: string;
  startAt?: string;
  endAt?: string;
  startAddress?: string;
  startLocationName?: string;
  startLocationLat?: number;
  startLocationLng?: number;
  endAddress?: string;
  endLocationName?: string;
  endLocationLat?: number;
  endLocationLng?: number;
  expense?: Expense;
  confirmationCode?: string;
  serviceNumber?: string;
  notes?: string;
  documents?: Document[];
  createdAt?: string;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTING TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface GeoCoords {
  lat: number;
  lng: number;
}

export type RouteResult =
  | { status: "loading" }
  | { status: "ready"; distanceMeters: number; durationSeconds: number }
  | { status: "unavailable" };

export type GeoHintStatus = { state: "prompt"; permissionState: "prompt" | "unknown" } | { state: "denied" };

export interface CoverImageSearchResult {
  id: string;
  url: string;
  photographer: string;
  photographerUrl?: string;
  alt: string;
}

export interface CoverImageSelection {
  url: string;
  photographer?: string;
  photographerUrl?: string;
}

export interface EventLocation {
  name?: string;
  address?: string;
  geo?: GeoCoords;
}

export interface SavedLocationValue {
  name?: string;
  address: string;
  lat?: number;
  lng?: number;
}

export interface LocationLookupSelection {
  name: string;
  fullAddress: string;
  center: [number, number];
}

export interface CurrencyOption {
  code: string;
  name: string;
}

export interface Expense {
  id: string;
  tripId: string;
  eventId?: string;
  reservationId?: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  convertedAmountTrip?: number;
  conversionRateTrip?: number;
  convertedCurrencyTrip?: string;
  convertedAmountProfile?: number;
  conversionRateProfile?: number;
  convertedCurrencyProfile?: string;
  date: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIP EVENT
// ─────────────────────────────────────────────────────────────────────────────

export interface TripEvent {
  // ── Identity ──────────────────────────────────────────────────────────────
  id: string;
  tripId?: string;
  dayId?: string;

  // ── Names & descriptions ──────────────────────────────────────────────────
  name: string;
  note?: string;

  // ── Scheduling ────────────────────────────────────────────────────────────
  startAt?: string;
  endAt?: string;
  displacedDate?: string;

  // ── Location ──────────────────────────────────────────────────────────────
  location?: EventLocation;
  // Flat DB-backed fields (prototype nested location above will be removed in Part 4)
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  expense?: Expense;

  // ── Booking reference ─────────────────────────────────────────────────────
  confirmationNumber?: string;

  // ── Attached documents ────────────────────────────────────────────────────
  docs?: Document[];

  position: number;
  linkedReservationId?: string;
  reservationType?: ReservationType;
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
// TRIP NOTE
// ─────────────────────────────────────────────────────────────────────────────

export interface TripNote {
  id: string;
  tripId: string;
  position: number;
  title?: string;
  body?: string;
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
  // Absent once the collaborator's account was deleted.
  username?: string;
  initials: string;
  role: CollaboratorRole;
  isCreator?: boolean;
  tint?: {
    bg: string;
    fg: string;
  };
  // Flat DB-backed tint fields (nested tint above will be removed in Part 4)
  tintBg?: string;
  tintFg?: string;
}

export interface Invitation {
  id: string;
  tripId: string;
  inviteeUsername: string;
  role: CollaboratorRole;
  status: InvitationStatus;
  expiresAt: string;
  invitedBy: string;
  createdAt?: string;
}

export interface PendingInvitation {
  id: string;
  tripId: string;
  tripName: string;
  inviterName: string;
  inviterUsername: string;
  role: CollaboratorRole;
  expiresAt: string;
}

export type AcceptInvitationResult = { status: "accepted"; tripId: string } | { status: "error"; message: string };

export type DeclineInvitationResult = { status: "declined" } | { status: "error"; message: string };

export type RescindInvitationResult = { status: "success" } | { status: "error"; message: string };

export type DismissInvitationResult = { status: "success" } | { status: "error"; message: string };

export type ResendInvitationResult = { status: "success"; expiresAt: string } | { status: "error"; message: string };

export type ContributorChange =
  | { type: "role"; collaboratorId: string; fromRole: CollaboratorRole; toRole: CollaboratorRole }
  | { type: "remove"; collaboratorId: string };

export type SaveContributorChangesResult =
  | { status: "success" }
  | { status: "error"; message: string; stale?: boolean };

// `stale` marks a caller whose membership was already gone (concurrent removal, forged trip id) —
// the client returns to the trips list rather than reporting a successful exit.
export type LeaveTripResult = { status: "success" } | { status: "error"; message: string; stale?: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT DELETION
// ─────────────────────────────────────────────────────────────────────────────

export const TripDeletionAction = {
  Transfer: "transfer",
  Delete: "delete",
} as const;
export type TripDeletionAction = (typeof TripDeletionAction)[keyof typeof TripDeletionAction];

export type TripDeletionChoice =
  | { tripId: string; action: typeof TripDeletionAction.Transfer; newOwnerUserId: string }
  | { tripId: string; action: typeof TripDeletionAction.Delete };

export interface AccountDeletionCollaborator {
  userId: string;
  name: string;
  role: CollaboratorRole;
}

// A trip the departing user owns that still has other members, so it needs an explicit
// transfer-or-delete decision. `collaborators` excludes the departing user and is in heir order.
export interface AccountDeletionTrip {
  tripId: string;
  name: string;
  memberCount: number;
  collaborators: AccountDeletionCollaborator[];
  suggestedHeirUserId: string;
}

export const AccountDeletionFailure = {
  Stale: "stale",
  LastAdmin: "last-admin",
} as const;
export type AccountDeletionFailure = (typeof AccountDeletionFailure)[keyof typeof AccountDeletionFailure];

// What a committed self-service deletion changed, for the caller's post-commit events and file cleanup.
export interface DeletedAccountSummary {
  rescindedInvitations: { inviteeId: string; tripId: string }[];
  transferredTrips: [tripId: string, heirUserId: string][];
  deletedTripIds: string[];
  deletedTripMembers: { tripId: string; userId: string }[];
  remainingTripIds: string[];
  storageUrls: string[];
  /** The deleted account as it was under the lock, for the caller's post-commit event. */
  account: ActivityIdentity;
}

export type DeleteOwnAccountResult =
  | { ok: true; summary: DeletedAccountSummary }
  | { ok: false; reason: AccountDeletionFailure };

// `stale` means the shared trips changed after the dialog loaded; the client refreshes and asks again.
export type DeleteAccountResult = { status: "success" } | { status: "error"; message: string; stale?: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// TRIP
// ─────────────────────────────────────────────────────────────────────────────

export interface Budget {
  currency: string;
  total?: number;
}

export interface PackingProgress {
  checked: number;
  total: number;
}

export interface Trip {
  id: string;
  status: TripStatus;
  name: string;
  tags?: string[];
  transitMode?: TransitMode | null;
  packingProgress?: PackingProgress;

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
  coverPhotographer?: string;
  coverPhotographerUrl?: string;
  destinationName?: string;
  destinationCountry?: string;
  destinationCountryCode?: string;
  notes?: string;
  budget?: Budget;

  collaborators?: Collaborator[];

  docs?: Document[];

  createdAt?: string;
  updatedAt?: string;

  // Set only by list-context queries (listTripsForUser) — the current viewer's
  // role on this trip, for gating manager-only controls in list/card UI.
  accessRole?: CollaboratorRole;
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKING
// ─────────────────────────────────────────────────────────────────────────────

export interface PackingItem {
  id?: string;
  name: string;
  done: boolean;
  tripId?: string;
  listId?: string | null;
  position?: number;
  isLabel?: boolean;
  labelId?: string | null;
}

export interface TripPackingList {
  id: string;
  tripId: string;
  name: string;
  position: number;
  createdAt?: string;
}

export interface CreateTripPackingListInput {
  name: string;
}

export interface RenameTripPackingListInput {
  name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PACKING TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

export interface PackingTemplate {
  id: string;
  name: string;
  createdAt?: string;
}

export interface CreatePackingTemplateInput {
  name: string;
}

export interface UpdatePackingTemplatePatch {
  name: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE SYNC EVENTS
// ─────────────────────────────────────────────────────────────────────────────

export const LiveSyncEventType = {
  ItineraryChanged: "itinerary-changed",
  MembershipChanged: "membership-changed",
  MembershipRemoved: "membership-removed",
  // Personal-channel only: the signed-in user left a trip themselves (from another tab or this one).
  // Distinct from MembershipRemoved, whose modal claims a manager removed them.
  MembershipLeft: "membership-left",
  // Personal-channel only: an invitation addressed to this user was created, resent or rescinded.
  InvitationChanged: "invitation-changed",
  TripDeleted: "trip-deleted",
} as const;
export type LiveSyncEventType = (typeof LiveSyncEventType)[keyof typeof LiveSyncEventType];

export const SyncConnectionStatus = {
  Connected: "connected",
  Reconnecting: "reconnecting",
  Offline: "offline",
} as const;
export type SyncConnectionStatus = (typeof SyncConnectionStatus)[keyof typeof SyncConnectionStatus];

export type LiveSyncEvent =
  | { type: typeof LiveSyncEventType.ItineraryChanged; tripId: string }
  | { type: typeof LiveSyncEventType.MembershipChanged; tripId: string }
  | {
      type: typeof LiveSyncEventType.MembershipRemoved;
      removedUserId: string;
      tripId: string;
      tripName: string;
      removedByName: string;
      removedByUsername: string;
    }
  | { type: typeof LiveSyncEventType.MembershipLeft; tripId: string }
  | { type: typeof LiveSyncEventType.InvitationChanged; tripId: string }
  | { type: typeof LiveSyncEventType.TripDeleted; tripId: string };

// ─────────────────────────────────────────────────────────────────────────────
// PACKING TEMPLATE ITEM
// ─────────────────────────────────────────────────────────────────────────────

export interface PackingTemplateItem {
  id: string;
  templateId: string;
  text: string;
  isLabel: boolean;
  position: number;
  labelId?: string | null;
}

export interface AddTemplateItemInput {
  text: string;
  isLabel?: boolean;
  afterItemId?: string;
  beforeItemId?: string;
  labelId?: string | null;
}

export interface UpdateTemplateItemInput {
  text: string;
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
  summaryEvents: TripEvent[];
}

export interface TripDetailPayload {
  trip: Trip;
  days: DayItinerary[];
  unscheduledEvents: TripEvent[];
  docs: Document[];
  collaborators: Collaborator[];
  packingItems: PackingItem[];
  packingLists: TripPackingList[];
  reservations: Reservation[];
  expenses: Expense[];
  notes: TripNote[];
  accessRole: CollaboratorRole;
}

export interface NewTripDraft {
  title: string;
  startDate?: string;
  endDate?: string;
  budgetAmount?: string;
  destinationName?: string;
  destinationCountry?: string;
  destinationCountryCode?: string;
  destinationCenter?: [number, number];
}

export interface CreateTripInput {
  name: string;
  startDate?: string; // ISO date "YYYY-MM-DD"
  endDate?: string;
  coverImageUrl?: string;
  destinationName?: string;
  destinationCountry?: string;
  destinationCountryCode?: string;
  destinationCenter?: [number, number];
  notes?: string;
  budgetCurrency?: string;
  budgetTotal?: number;
  tags?: string[];
  transitMode?: TransitMode | null;
}

export interface UpdateTripPatch {
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
  coverImageUrl?: string | null;
  destinationName?: string | null;
  destinationCountry?: string | null;
  destinationCountryCode?: string | null;
  notes?: string;
  budgetCurrency?: string;
  budgetTotal?: number;
  tags?: string[];
  transitMode?: TransitMode | null;
}

export const TripDateConflictResolution = {
  DeleteEvents: "delete-events",
  KeepAsUnscheduled: "keep-as-unscheduled",
} as const;
export type TripDateConflictResolution = (typeof TripDateConflictResolution)[keyof typeof TripDateConflictResolution];

export interface TripDateChangePreviewEvent {
  id: string;
  name: string;
  displacedDate?: string;
  docCount: number;
}

export interface TripDateChangePreviewReservation {
  id: string;
  provider: string;
  type: ReservationType;
  date: string;
}

export interface TripDateChangeConfirmation {
  removedDates: string[];
  removedDayLabels?: string[];
  events: TripDateChangePreviewEvent[];
  reservations?: TripDateChangePreviewReservation[];
  noteCount: number;
  checklistCount: number;
  eventDocumentCount: number;
}

export type UpdateTripMetadataResult =
  | { status: "saved" }
  | { status: "confirmation-required"; confirmation: TripDateChangeConfirmation };

export const TripCurrencyChangeMode = {
  Convert: "convert",
  LeaveAsIs: "leave-as-is",
} as const;
export type TripCurrencyChangeMode = (typeof TripCurrencyChangeMode)[keyof typeof TripCurrencyChangeMode];

export interface CreateEventInput {
  name: string;
  startAt?: string; // ISO datetime
  endAt?: string;
  locationName?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
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

export interface RemoveLastDayResult {
  status: "removed" | "confirmation-required";
  hasPlannedContent?: boolean;
}

export interface InviteContributorInput {
  username: string;
  role?: CollaboratorRole;
}

export type InviteContributorErrorCode =
  | "invalid-role"
  | "self-invite"
  | "no-account"
  | "already-collaborator"
  | "invite-conflict";

export type InviteContributorResult =
  | { status: "invited" }
  | { status: "resent" }
  | { status: "error"; message: string; errorCode: InviteContributorErrorCode };

export interface AddDocumentInput {
  tripId?: string;
  eventId?: string;
  reservationId?: string;
  name: string;
  kind: string;
  size?: string;
  url?: string;
}

export interface CreateTripNoteInput {
  title?: string;
  body?: string;
}

export interface UpdateTripNoteInput {
  title?: string;
  body?: string;
}

export interface ReorderTripNotesInput {
  tripId: string;
  orderedNoteIds: string[];
}

export interface CreateReservationInput {
  type: ReservationType;
  provider: string;
  startAt?: string; // ISO datetime
  endAt?: string;
  startAddress?: string;
  startLocationName?: string;
  startLocationLat?: number;
  startLocationLng?: number;
  endAddress?: string;
  endLocationName?: string;
  endLocationLat?: number;
  endLocationLng?: number;
  confirmationCode?: string;
  serviceNumber?: string;
  notes?: string;
}

export interface UpdateReservationPatch {
  provider?: string;
  startAt?: string;
  endAt?: string;
  startAddress?: string;
  startLocationName?: string;
  startLocationLat?: number;
  startLocationLng?: number;
  endAddress?: string;
  endLocationName?: string;
  endLocationLat?: number;
  endLocationLng?: number;
  confirmationCode?: string;
  serviceNumber?: string;
  notes?: string;
}

export interface CreateExpenseInput {
  eventId?: string;
  reservationId?: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  date: string;
  note?: string;
  convertedAmountTrip?: number | null;
  conversionRateTrip?: number | null;
  convertedCurrencyTrip?: string | null;
  convertedAmountProfile?: number | null;
  conversionRateProfile?: number | null;
  convertedCurrencyProfile?: string | null;
}

export interface UpdateExpensePatch {
  eventId?: string | null;
  reservationId?: string | null;
  category?: ExpenseCategory;
  amount?: number;
  currency?: string;
  date?: string;
  note?: string | null;
  convertedAmountTrip?: number | null;
  conversionRateTrip?: number | null;
  convertedCurrencyTrip?: string | null;
  convertedAmountProfile?: number | null;
  conversionRateProfile?: number | null;
  convertedCurrencyProfile?: string | null;
}

export interface AddPackingItemInput {
  name: string;
  isLabel?: boolean;
  afterItemId?: string;
  beforeItemId?: string;
  labelId?: string | null;
  listId?: string | null;
}

export interface UpdatePackingItemInput {
  name?: string;
}

export const RemovePackingSectionMode = {
  MoveItemsToUngrouped: "move-items-to-ungrouped",
  DeleteItems: "delete-items",
} as const;
export type RemovePackingSectionMode = (typeof RemovePackingSectionMode)[keyof typeof RemovePackingSectionMode];

export interface RemovePackingSectionInput {
  mode: RemovePackingSectionMode;
}

export interface PullTemplatesResult {
  added: number;
  skipped: number;
}

export interface SaveTripAsTemplateResult {
  templateId: string;
}

// ── Account security ─────────────────────────────────────────────────────────

// `code` values on the CredentialsSignin errors thrown from authorize(). They appear in Auth.js error URLs,
// so they must never carry anything secret.
export const AuthErrorCode = {
  Locked: "locked",
  MfaRequired: "mfa_required",
} as const;
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

// Why a security change sent the user back to /sign-in (?notice=...).
export const SignInNotice = {
  PasswordChanged: "password-changed",
  MfaEnabled: "mfa-enabled",
  MfaDisabled: "mfa-disabled",
  SignedOutEverywhere: "signed-out-everywhere",
} as const;
export type SignInNotice = (typeof SignInNotice)[keyof typeof SignInNotice];

export type SignInActionState = { error?: string; mfaRequired?: boolean } | undefined;
export type MfaActionState = { error?: string; expired?: boolean } | undefined;

export interface MfaStatus {
  enabled: boolean;
  enabledAt?: string;
  recoveryCodesRemaining: number;
}

export interface MfaEnrollmentStart {
  secret: string;
  qrDataUrl: string;
}

export interface SecondFactorInput {
  password: string;
  code: string;
}

export interface TrustedDeviceSummary {
  id: string;
  label: string;
  lastUsedAt: string;
  mfaRememberedUntil?: string;
  isCurrent: boolean;
}
