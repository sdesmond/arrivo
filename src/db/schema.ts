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
  (t) => [unique().on(t.provider, t.providerAccountId)]
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
  (t) => [unique().on(t.identifier, t.token)]
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
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  coverImageUrl: text("cover_image_url"),
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
  (t) => [unique().on(t.tripId, t.dayNumber)]
);

export const events = pgTable(
  "events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    dayId: uuid("day_id")
      .notNull()
      .references(() => days.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
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
  (t) => [index().on(t.dayId, t.position)]
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
  (t) => [unique().on(t.tripId, t.email)]
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
  position: integer("position").notNull(),
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
  (t) => [index().on(t.dayId, t.position)]
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
  (t) => [index().on(t.checklistId, t.createdAt)]
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
  (t) => [index().on(t.dayId, t.position)]
);
