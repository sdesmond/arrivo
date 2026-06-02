import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  date,
  doublePrecision,
  numeric,
  timestamp,
  jsonb,
  index,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Auth.js v5 required tables ──────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: text("password_hash"),
  dateFormat: text("date_format"),
  currency: text("currency"),
  distanceUnit: text("distance_unit"),
  passportNumber: text("passport_number"),
  passportExpiry: date("passport_expiry"),
  passportNationality: text("passport_nationality"),
  knownTravelerNumber: text("known_traveler_number"),
  defaultCoverType: text("default_cover_type"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (table) => [unique().on(table.provider, table.providerAccountId)]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [unique().on(table.identifier, table.token)]
);

// ── App tables ───────────────────────────────────────────────────────────────

export const trips = pgTable("trips", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: date("start_date"),
  endDate: date("end_date"),
  coverImageUrl: text("cover_image_url"),
  destinationName: text("destination_name"),
  destinationCountry: text("destination_country"),
  destinationCountryCode: text("destination_country_code"),
  notes: text("notes"),
  budgetCurrency: text("budget_currency"),
  budgetTotal: numeric("budget_total", { precision: 12, scale: 2 }),
  budgetPerPerson: numeric("budget_per_person", { precision: 12, scale: 2 }),
  tags: text("tags")
    .array()
    .default(sql`'{}'`),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
});

export const days = pgTable(
  "days",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    dayNumber: integer("day_number").notNull(),
    date: date("date"),
    label: text("label").notNull(),
    subtitle: text("subtitle"),
    weather: text("weather"),
    travelSummary: text("travel_summary"),
  },
  (table) => [unique().on(table.tripId, table.dayNumber)]
);

export const events = pgTable(
  "events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    dayId: uuid("day_id").references(() => days.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    displacedDate: date("displaced_date"),
    locationName: text("location_name"),
    locationAddress: text("location_address"),
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    confirmationNumber: text("confirmation_number"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [index().on(table.dayId, table.position)]
);

export const documents = pgTable("documents", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tripId: uuid("trip_id").references(() => trips.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  size: text("size"),
  offline: boolean("offline").default(false),
  url: text("url"),
  previewLines: jsonb("preview_lines"),
  addedAt: timestamp("added_at", { withTimezone: true }).default(sql`now()`),
});

export const collaborators = pgTable(
  "collaborators",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    initials: text("initials").notNull(),
    role: text("role").notNull(),
    tintBg: text("tint_bg"),
    tintFg: text("tint_fg"),
  },
  (table) => [unique().on(table.tripId, table.email)]
);

export const userLoyaltyNumbers = pgTable(
  "user_loyalty_numbers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programName: text("program_name").notNull(),
    memberNumber: text("member_number").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [index().on(table.userId, table.position)]
);

export const userWishlistDestinations = pgTable(
  "user_wishlist_destinations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [index().on(table.userId, table.position)]
);

export const packingItems = pgTable("packing_items", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  tripId: uuid("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  done: boolean("done").default(false),
  isLabel: boolean("is_label").default(false).notNull(),
  position: integer("position").notNull(),
  labelId: uuid("label_id").references((): AnyPgColumn => packingItems.id, { onDelete: "set null" }),
});

export const itineraryChecklists = pgTable(
  "itinerary_checklists",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    dayId: uuid("day_id")
      .notNull()
      .references(() => days.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [index().on(table.dayId, table.position)]
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    checklistId: uuid("checklist_id")
      .notNull()
      .references(() => itineraryChecklists.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isChecked: boolean("is_checked").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [index().on(table.checklistId, table.createdAt)]
);

export const itineraryNotes = pgTable(
  "itinerary_notes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    dayId: uuid("day_id")
      .notNull()
      .references(() => days.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [index().on(table.dayId, table.position)]
);

export const userCompanions = pgTable(
  "user_companions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    age: integer("age"),
    passportNumber: text("passport_number"),
    passportExpiry: date("passport_expiry"),
    passportNationality: text("passport_nationality"),
    knownTravelerNumber: text("known_traveler_number"),
    packtUsername: text("packt_username"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [index().on(table.userId, table.position)]
);

export const packingTemplates = pgTable(
  "packing_templates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [index().on(table.userId)]
);

export const packingTemplates = pgTable(
  "packing_templates",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).default(sql`now()`),
  },
  (table) => [index().on(table.userId)]
);
