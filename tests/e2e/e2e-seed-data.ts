import { ExpenseCategory, TransitMode } from "../../src/data/types";
import type { UserRole, ReservationType } from "../../src/data/types";

export interface UserSeed {
  setupComplete?: boolean;
  role?: UserRole;
  name: string;
  initials: string;
  dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY";
  currency?: string;
  defaultCoverType?: "graphic" | "map";
}

export interface LoyaltyNumberSeed {
  programName: string;
  memberNumber: string;
  position: number;
}

export interface CompanionSeed {
  name: string;
  age: number;
  position: number;
}

export interface UserMother {
  user: UserSeed;
  loyaltyNumbers: LoyaltyNumberSeed[];
  companions: CompanionSeed[];
}

export interface DaySeed {
  dayNumber: number;
  date: string | null;
  label: string;
  weather?: string | null;
  travelSummary?: string | null;
}

export interface EventSeed {
  name: string;
  position: number;
  dayNumber?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  displacedDate?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
}

export interface DocumentSeed {
  name: string;
  kind: string;
  size?: string | number;
  url: string;
  eventName?: string;
  reservationProvider?: string;
}

export interface PackingItemSeed {
  name: string;
  isLabel: boolean;
  done: boolean;
  position: number;
  under?: string;
}

export interface ChecklistItemSeed {
  text: string;
  position: number;
  isChecked?: boolean;
}

export interface ChecklistSeed {
  dayNumber: number;
  position: number;
  title?: string | null;
  items: ChecklistItemSeed[];
}

export interface NoteSeed {
  dayNumber: number;
  position: number;
  content: string;
}

export interface TripNoteSeed {
  title: string;
  position: number;
}

export interface PackingListSeed {
  name: string;
  position: number;
  items: PackingItemSeed[];
}

export interface ExpenseSeed {
  category: ExpenseCategory;
  amount: number;
  currency: string;
  date: string;
  convertedAmountProfile?: number;
  eventName?: string;
}

export interface ReservationSeed {
  type: ReservationType;
  provider: string;
  startAt?: string | null;
  endAt?: string | null;
  startAddress?: string | null;
  startLocationName?: string | null;
  startLocationLat?: number | null;
  startLocationLng?: number | null;
  endAddress?: string | null;
  endLocationName?: string | null;
  endLocationLat?: number | null;
  endLocationLng?: number | null;
  confirmationCode?: string | null;
  notes?: string | null;
}

export interface TripSeed {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  coverImageUrl?: string | null;
  destinationName?: string | null;
  destinationCountry?: string | null;
  destinationCountryCode?: string | null;
  budgetCurrency?: string | null;
  budgetTotal?: number | null;
  transitMode?: TransitMode | null;
}

export interface TripMother {
  trip: TripSeed;
  days: DaySeed[];
  events: EventSeed[];
  documents: DocumentSeed[];
  packingItems: PackingItemSeed[];
  packingLists: PackingListSeed[];
  notes: NoteSeed[];
  tripNotes: TripNoteSeed[];
  checklists: ChecklistSeed[];
  reservations: ReservationSeed[];
  expenses: ExpenseSeed[];
}

export interface TemplateItemSeed {
  text: string;
  isLabel: boolean;
  position: number;
  under?: string;
}

export interface TemplateMother {
  template: { name: string };
  items: TemplateItemSeed[];
}

export interface UserMotherOverrides {
  user?: Partial<UserSeed>;
  loyaltyNumbers?: LoyaltyNumberSeed[];
  companions?: CompanionSeed[];
}

export interface TripMotherOverrides {
  trip?: Partial<TripSeed>;
  days?: DaySeed[];
  events?: EventSeed[];
  documents?: DocumentSeed[];
  packingItems?: PackingItemSeed[];
  packingLists?: PackingListSeed[];
  notes?: NoteSeed[];
  tripNotes?: TripNoteSeed[];
  checklists?: ChecklistSeed[];
  reservations?: ReservationSeed[];
  expenses?: ExpenseSeed[];
}

export interface TemplateMotherOverrides {
  template?: Partial<{ name: string }>;
  items?: TemplateItemSeed[];
}

function toDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function firstDayOfMonthAfterNext(): string {
  const now = new Date();
  return toDateKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1)));
}

export function e2eTripDate(offsetDays: number): string {
  const date = new Date(`${E2E_TRIP_START_DATE}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return toDateKey(date);
}

export function e2eTripDateTime(offsetDays: number, time: string): string {
  return `${e2eTripDate(offsetDays)}T${time}Z`;
}

export const E2E_TRIP_START_DATE = firstDayOfMonthAfterNext();
export const E2E_TRIP_SECOND_DATE = e2eTripDate(1);
export const E2E_TRIP_THIRD_DATE = e2eTripDate(2);
export const E2E_TRIP_FOURTH_DATE = e2eTripDate(3);
export const E2E_TRIP_ALT_START_DATE = e2eTripDate(10);
export const E2E_TRIP_ALT_THIRD_DATE = e2eTripDate(12);

export const BASELINE_E2E_USER = {
  username: process.env.E2E_USERNAME ?? "e2e",
  name: "E2E Baseline User",
};

export const DEFAULT_USER_MOTHER: UserMother = {
  user: {
    name: "E2E Scenario User",
    initials: "ES",
    dateFormat: "MM/DD/YYYY",
    currency: "USD",
    defaultCoverType: "graphic",
  },
  loyaltyNumbers: [
    {
      programName: "Test Airlines",
      memberNumber: "TA-123456",
      position: 0,
    },
  ],
  companions: [
    {
      name: "Alex Companion",
      age: 30,
      position: 0,
    },
  ],
};

export const THREE_DAY_TRIP_MOTHER: TripMother = {
  trip: {
    name: "E2E Test Trip",
    startDate: E2E_TRIP_START_DATE,
    endDate: E2E_TRIP_THIRD_DATE,
    coverImageUrl: "graphic:var(--accent-brand)/plane",
    transitMode: TransitMode.Drive,
  },
  days: [
    { dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" },
    { dayNumber: 2, date: E2E_TRIP_SECOND_DATE, label: "Day 2" },
    { dayNumber: 3, date: E2E_TRIP_THIRD_DATE, label: "Day 3" },
  ],
  events: [],
  documents: [],
  packingItems: [],
  packingLists: [],
  notes: [],
  tripNotes: [],
  checklists: [],
  reservations: [],
  expenses: [],
};

export const DATELESS_TRIP_MOTHER: TripMother = {
  trip: {
    name: "Dateless Trip",
    startDate: null,
    endDate: null,
    coverImageUrl: "graphic:var(--accent-brand)/plane",
    transitMode: TransitMode.Drive,
  },
  days: [{ dayNumber: 1, date: null, label: "Day 1" }],
  events: [],
  documents: [],
  packingItems: [],
  packingLists: [],
  notes: [],
  tripNotes: [],
  checklists: [],
  reservations: [],
  expenses: [],
};

export const DELETE_TRIP_MOTHER: TripMother = {
  trip: {
    name: "E2E Delete Trip",
    startDate: E2E_TRIP_START_DATE,
    endDate: E2E_TRIP_THIRD_DATE,
    transitMode: TransitMode.Drive,
  },
  days: [
    { dayNumber: 1, date: E2E_TRIP_START_DATE, label: "Day 1" },
    { dayNumber: 2, date: E2E_TRIP_SECOND_DATE, label: "Day 2" },
    { dayNumber: 3, date: E2E_TRIP_THIRD_DATE, label: "Day 3" },
  ],
  events: [],
  documents: [],
  packingItems: [],
  packingLists: [],
  notes: [],
  tripNotes: [],
  checklists: [],
  reservations: [],
  expenses: [],
};

export const EMPTY_TEMPLATE_MOTHER: TemplateMother = {
  template: {
    name: "E2E Template",
  },
  items: [],
};

export const E2E_DOCUMENT = {
  name: "E2E Boarding Pass",
  kind: "pdf",
  size: "1.2 MB",
  url: "https://example.com/boarding-pass.pdf",
} as const;

export const E2E_RESERVATION = {
  type: "lodging",
  provider: "E2E Hotel Reservation",
  startAt: e2eTripDateTime(0, "15:00:00"),
  endAt: e2eTripDateTime(2, "11:00:00"),
  confirmationCode: "E2E-CONF-123",
} as const;

export const E2E_PICK_DOC = {
  name: "E2E Pick Doc",
  kind: "pdf",
  size: "0.5 MB",
  url: "https://example.com/pick-doc.pdf",
} as const;

export const E2E_EVENT = {
  name: "E2E Event",
  position: 0,
} as const;

export const E2E_EVENT_KEEP = {
  name: "E2E Event Keep",
  position: 1,
} as const;

export const E2E_EVENT_ERASE = {
  name: "E2E Event Erase",
  position: 2,
} as const;

export const E2E_KEEP_DOC = {
  name: "E2E Keep Doc",
  kind: "pdf",
  size: "0.5 MB",
  url: "https://example.com/keep-doc.pdf",
} as const;

export const E2E_ERASE_DOC = {
  name: "E2E Erase Doc",
  kind: "pdf",
  size: "0.5 MB",
  url: "https://example.com/erase-doc.pdf",
} as const;

export const E2E_EVENT_MANAGE = {
  name: "E2E Event Manage",
  position: 3,
} as const;

export const E2E_EVENT_DELETE = {
  name: "Event to Remove",
  position: 9,
} as const;

export const E2E_EVENT_UNTIMED = {
  name: "Untimed Event",
  position: 10,
} as const;

export const E2E_EVENT_REORDER_FIRST = {
  name: "Drag First",
  position: 11,
} as const;

export const E2E_EVENT_REORDER_SECOND = {
  name: "Drag Second",
  position: 12,
} as const;

export const E2E_MANAGE_DOC = {
  name: "E2E Manage Doc",
  kind: "pdf",
  size: "0.3 MB",
  url: "https://example.com/manage-doc.pdf",
} as const;

export const E2E_PACKING_ITEMS: PackingItemSeed[] = [
  { name: "Sunscreen", isLabel: false, done: false, position: 0 },
  { name: "Sunglasses", isLabel: false, done: false, position: 1 },
  { name: "Beach towel", isLabel: false, done: false, position: 2 },
];

export const E2E_PACKING_ITEMS_WITH_LABELS: PackingItemSeed[] = [
  { name: "Beach day", isLabel: true, done: false, position: 0 },
  { name: "Sunscreen", isLabel: false, done: false, position: 1 },
  { name: "Sunglasses", isLabel: false, done: false, position: 2 },
];

export const E2E_PACKING_REORDER_ITEMS: PackingItemSeed[] = [
  { name: "Item A", isLabel: false, done: false, position: 0 },
  { name: "Item B", isLabel: false, done: false, position: 1 },
  { name: "Item C", isLabel: false, done: false, position: 2 },
];

export const E2E_TRIP_NOTES_REORDER: TripNoteSeed[] = [
  { title: "First note", position: 0 },
  { title: "Second note", position: 1 },
  { title: "Third note", position: 2 },
];

export const E2E_PACKING_STRIKETHROUGH_ITEMS: PackingItemSeed[] = [
  { name: "Documents", isLabel: true, done: false, position: 0 },
  { name: "Passport", isLabel: false, done: false, position: 1 },
  { name: "Visa", isLabel: false, done: false, position: 2 },
];

export const E2E_PACKING_CONTEXTUAL_ADD_ITEMS: PackingItemSeed[] = [
  { name: "Documents", isLabel: true, done: false, position: 0 },
  { name: "Passport", isLabel: false, done: false, position: 1 },
];

export const E2E_PACKING_DRAG_ITEMS: PackingItemSeed[] = [
  { name: "Clothes", isLabel: true, done: false, position: 0 },
  { name: "Shirt", isLabel: false, done: false, position: 1, under: "Clothes" },
  { name: "Pants", isLabel: false, done: false, position: 2, under: "Clothes" },
  { name: "Charger", isLabel: false, done: false, position: 3 },
  { name: "Adapter", isLabel: false, done: false, position: 4 },
];

export const E2E_PACKING_DRAG_EMPTY_UNGROUPED: PackingItemSeed[] = [
  { name: "Clothes", isLabel: true, done: false, position: 0 },
  { name: "Shirt", isLabel: false, done: false, position: 1, under: "Clothes" },
  { name: "Pants", isLabel: false, done: false, position: 2, under: "Clothes" },
];

export const E2E_PACKING_DRAG_TWO_SECTIONS: PackingItemSeed[] = [
  { name: "Clothes", isLabel: true, done: false, position: 0 },
  { name: "Shirt", isLabel: false, done: false, position: 1, under: "Clothes" },
  { name: "Pants", isLabel: false, done: false, position: 2, under: "Clothes" },
  { name: "Toiletries", isLabel: true, done: false, position: 3 },
  { name: "Toothbrush", isLabel: false, done: false, position: 4, under: "Toiletries" },
];

export const E2E_PACKING_INLINE_EDIT_ITEMS: PackingItemSeed[] = [
  { name: "Passport", isLabel: false, done: false, position: 0 },
];

export const E2E_PACKING_RENAME_LABEL_ITEMS: PackingItemSeed[] = [
  { name: "Documents", isLabel: true, done: false, position: 0 },
];

export const E2E_PACKING_DELETE_LABEL_ITEMS: PackingItemSeed[] = [
  { name: "Documents", isLabel: true, done: false, position: 0 },
  { name: "Passport", isLabel: false, done: false, position: 1 },
];

export const E2E_TEMPLATE = {
  name: "Beach Weekend",
} as const;

export const E2E_TEMPLATE_RENAMED = {
  name: "Carry-on Only",
} as const;

export const E2E_TEMPLATE_LIST = [{ name: "Business Trip" }, { name: "Winter Ski" }] as const;

export const E2E_TEMPLATE_EDITOR = {
  name: "Editor Template",
} as const;

export const E2E_TEMPLATE_EDITOR_ITEMS: TemplateItemSeed[] = [
  { text: "Sunscreen", isLabel: false, position: 0 },
  { text: "Sunglasses", isLabel: false, position: 1 },
];

export const E2E_TEMPLATE_LABEL_ITEMS: TemplateItemSeed[] = [
  { text: "Beach Gear", isLabel: true, position: 0 },
  { text: "Towel", isLabel: false, position: 1, under: "Beach Gear" },
];

export const E2E_TEMPLATE_PULL = { name: "Pull Template" } as const;

export const E2E_TEMPLATE_PULL_ITEMS: TemplateItemSeed[] = [
  { text: "Passport", isLabel: false, position: 0 },
  { text: "Phone Charger", isLabel: false, position: 1 },
  { text: "Toothbrush", isLabel: false, position: 2 },
];

export const E2E_TEMPLATE_PULL_2 = { name: "Pull Template 2" } as const;

export const E2E_TEMPLATE_PULL_2_ITEMS: TemplateItemSeed[] = [
  { text: "Toothbrush", isLabel: false, position: 0 },
  { text: "Shampoo", isLabel: false, position: 1 },
];

export type UserMotherName = "default";
export type TripMotherName = "threeDayTrip" | "datelessTrip" | "deleteTrip";
export type TemplateMotherName = "emptyTemplate";

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

export function cloneUserMother(name: UserMotherName = "default", overrides: UserMotherOverrides = {}): UserMother {
  const base = cloneValue(name === "default" ? DEFAULT_USER_MOTHER : DEFAULT_USER_MOTHER);

  return {
    user: { ...base.user, ...overrides.user },
    loyaltyNumbers: overrides.loyaltyNumbers ? cloneValue(overrides.loyaltyNumbers) : base.loyaltyNumbers,
    companions: overrides.companions ? cloneValue(overrides.companions) : base.companions,
  };
}

export function cloneTripMother(
  name: TripMotherName = "threeDayTrip",
  overrides: TripMotherOverrides = {}
): TripMother {
  const source =
    name === "datelessTrip" ? DATELESS_TRIP_MOTHER : name === "deleteTrip" ? DELETE_TRIP_MOTHER : THREE_DAY_TRIP_MOTHER;
  const base = cloneValue(source);

  return {
    trip: { ...base.trip, ...overrides.trip },
    days: overrides.days ? cloneValue(overrides.days) : base.days,
    events: overrides.events ? cloneValue(overrides.events) : base.events,
    documents: overrides.documents ? cloneValue(overrides.documents) : base.documents,
    packingItems: overrides.packingItems ? cloneValue(overrides.packingItems) : base.packingItems,
    packingLists: overrides.packingLists ? cloneValue(overrides.packingLists) : base.packingLists,
    notes: overrides.notes ? cloneValue(overrides.notes) : base.notes,
    tripNotes: overrides.tripNotes ? cloneValue(overrides.tripNotes) : base.tripNotes,
    checklists: overrides.checklists ? cloneValue(overrides.checklists) : base.checklists,
    reservations: overrides.reservations ? cloneValue(overrides.reservations) : base.reservations,
    expenses: overrides.expenses ? cloneValue(overrides.expenses) : base.expenses,
  };
}

export function cloneTemplateMother(
  name: TemplateMotherName = "emptyTemplate",
  overrides: TemplateMotherOverrides = {}
): TemplateMother {
  const base = cloneValue(name === "emptyTemplate" ? EMPTY_TEMPLATE_MOTHER : EMPTY_TEMPLATE_MOTHER);

  return {
    template: { ...base.template, ...overrides.template },
    items: overrides.items ? cloneValue(overrides.items) : base.items,
  };
}
