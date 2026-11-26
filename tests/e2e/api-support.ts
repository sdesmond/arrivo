// State and helpers shared by two or more `steps/api-*.steps.ts` files. Holds no steps.
// Keep anything used by one file in that file; move it here only when a second file needs it.
import { type APIResponse, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import postgres from "postgres";
import {
  checklistItems,
  itineraryChecklists,
  days,
  events,
  itineraryNotes,
  notes,
  packingItems,
} from "../../src/db/schema";
import { withE2EDb } from "./e2e-db";

export interface KeyedResult {
  status: number;
  body: unknown;
}
export interface ApiScenarioState {
  itemId: string;
  role?: string;
  revokedCookie?: string;
  response?: APIResponse;
  /** Per-scenario `Idempotency-Key` value and the unique suffix of its audit/failure database objects. */
  key: string;
  suffix: string;
  auditInstalled?: boolean;
  failureInstalled?: boolean;
  /** A second connection holding the actor/key advisory lock, released by `release`. */
  lockHolder?: { release: () => void; finished: Promise<unknown>; client: ReturnType<typeof postgres> };
  /** Results of the latest keyed send/retry step, and the body of the first successful keyed response. */
  responses: KeyedResult[];
  first?: unknown;
  lifecycle?: {
    tripId: string;
    dayId: string;
    id: string;
    firstItem: { id: string; content: string };
    position: number;
    title: string;
  };
  untouchedDay?: { dayId: string; before: Awaited<ReturnType<typeof timelineSnapshot>> };
}
export const REPLAY_KEY_PREFIX = "api:v1:";
export const states = new WeakMap<Page, ApiScenarioState>();
export function state(page: Page): ApiScenarioState {
  const value = states.get(page);
  if (!value) throw new Error("API fixture missing");
  return value;
}
export function headers(page: Page) {
  return { "x-arrivo-client": "web", "content-type": "application/json", origin: new URL(page.url()).origin };
}
export function itemUrl(itemId: string) {
  return `/api/v1/checklist-items/${itemId}`;
}
export async function lifecycleInput(page: Page, tripId: string) {
  const current = state(page);
  if (!current.lifecycle) {
    const [day] = await withE2EDb((database) =>
      database
        .select({ id: days.id })
        .from(days)
        .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 1)))
    );
    current.lifecycle = {
      tripId,
      dayId: day.id,
      id: randomUUID(),
      firstItem: { id: randomUUID(), content: "Lifecycle shoes" },
      position: 1,
      title: "Lifecycle packing",
    };
  }
  return current.lifecycle;
}
export async function expandLifecycleDay(page: Page) {
  const toggle = page.getByRole("button", { name: /Fri, Jan 1 .*stops/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}
export async function timelineSnapshot(dayId: string) {
  return withE2EDb(async (database) => ({
    events: await database
      .select({ id: events.id, position: events.position })
      .from(events)
      .where(eq(events.dayId, dayId))
      .orderBy(events.id),
    notes: await database
      .select({ id: itineraryNotes.id, position: itineraryNotes.position })
      .from(itineraryNotes)
      .where(eq(itineraryNotes.dayId, dayId))
      .orderBy(itineraryNotes.id),
    checklists: await database
      .select({ id: itineraryChecklists.id, position: itineraryChecklists.position })
      .from(itineraryChecklists)
      .where(eq(itineraryChecklists.dayId, dayId))
      .orderBy(itineraryChecklists.id),
    items: await database
      .select({ id: checklistItems.id, checklistId: checklistItems.checklistId })
      .from(checklistItems)
      .innerJoin(itineraryChecklists, eq(checklistItems.checklistId, itineraryChecklists.id))
      .where(eq(itineraryChecklists.dayId, dayId))
      .orderBy(checklistItems.id),
  }));
}
// Checklist item lifecycle (create, partial update, delete) over the API.
export interface ItemApiState {
  tripId: string;
  checklistId: string;
  id: string;
  content: string;
  countBefore?: number;
}
export const itemApiStates = new WeakMap<Page, ItemApiState>();
export function itemApi(page: Page): ItemApiState {
  const value = itemApiStates.get(page);
  if (!value) throw new Error("Item API state missing");
  return value;
}
export function itemsUrl(checklistId: string) {
  return `/api/v1/checklists/${checklistId}/items`;
}
export async function ensureItemApi(page: Page, tripId: string): Promise<ItemApiState> {
  const existing = itemApiStates.get(page);
  if (existing) return existing;
  const [checklist] = await withE2EDb((database) =>
    database
      .select({ id: itineraryChecklists.id })
      .from(itineraryChecklists)
      .innerJoin(days, eq(itineraryChecklists.dayId, days.id))
      .where(and(eq(days.tripId, tripId), eq(itineraryChecklists.title, "API packing")))
  );
  const created = { tripId, checklistId: checklist.id, id: randomUUID(), content: "API created item" };
  itemApiStates.set(page, created);
  return created;
}
export async function storedItems(checklistId: string) {
  const rows = await withE2EDb((database) =>
    database.select().from(checklistItems).where(eq(checklistItems.checklistId, checklistId))
  );
  return rows.sort((left, right) => (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0));
}
// Packing-source checklist creation over the API.
export type PackingSourceType = "template" | "packing-list";
export interface SourceApiState {
  tripId: string;
  dayId: string;
  checklistId: string;
  position: number;
  source: { type: PackingSourceType; id: string };
  title: string;
  /** Non-label item text in source position order. */
  contents: string[];
  before: Awaited<ReturnType<typeof timelineSnapshot>>;
  first?: unknown;
  retry?: KeyedResult;
  /** Another trip's day and timeline, for the wrong-trip cases. */
  other?: { dayId: string; before: Awaited<ReturnType<typeof timelineSnapshot>> };
  secretName?: string;
}
export const sourceApiStates = new WeakMap<Page, SourceApiState>();
export function sourceApi(page: Page): SourceApiState {
  const value = sourceApiStates.get(page);
  if (!value) throw new Error("Packing source API state missing");
  return value;
}
export async function dayOneId(tripId: string): Promise<string> {
  const [day] = await withE2EDb((database) =>
    database
      .select({ id: days.id })
      .from(days)
      .where(and(eq(days.tripId, tripId), eq(days.dayNumber, 1)))
  );
  return day.id;
}
// ── Day order API ───────────────────────────────────────────────────────────
export interface DayItem {
  type: "event" | "note" | "checklist";
  id: string;
}
export interface DayOrderState {
  tripId: string;
  dayId: string;
  original: DayItem[];
  foreign: DayItem;
  response?: APIResponse;
  key: string;
}
export const dayOrderStates = new WeakMap<Page, DayOrderState>();
export function dayOrderState(page: Page): DayOrderState {
  const value = dayOrderStates.get(page);
  if (!value) throw new Error("Day order API fixture missing");
  return value;
}
/** The day's events, notes and checklists in stored position order, as the order endpoint names them. */
export async function storedDayOrder(dayId: string): Promise<DayItem[]> {
  const [eventRows, noteRows, checklistRows] = await withE2EDb((database) =>
    Promise.all([
      database.select({ id: events.id, position: events.position }).from(events).where(eq(events.dayId, dayId)),
      database
        .select({ id: itineraryNotes.id, position: itineraryNotes.position })
        .from(itineraryNotes)
        .where(eq(itineraryNotes.dayId, dayId)),
      database
        .select({ id: itineraryChecklists.id, position: itineraryChecklists.position })
        .from(itineraryChecklists)
        .where(eq(itineraryChecklists.dayId, dayId)),
    ])
  );
  return [
    ...eventRows.map((row) => ({ type: "event" as const, id: row.id, position: row.position })),
    ...noteRows.map((row) => ({ type: "note" as const, id: row.id, position: row.position })),
    ...checklistRows.map((row) => ({ type: "checklist" as const, id: row.id, position: row.position })),
  ]
    .sort((first, second) => first.position - second.position)
    .map(({ type, id }) => ({ type, id }));
}
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
export function existingNoteId(page: Page): string {
  const note = dayOrderState(page).original.find((item) => item.type === "note");
  if (!note) throw new Error("The mixed day holds no note.");
  return note.id;
}
// ── Trip note API ───────────────────────────────────────────────────────────
export interface TripNoteApiState {
  tripId: string;
  /** The seeded notes' ids in stored order, first to last. */
  original: string[];
  response?: APIResponse;
  responses: APIResponse[];
  clientId?: string;
  retryBody?: Record<string, unknown>;
  /** The first note's row as stored just before the latest PATCH, to prove a repeat wrote nothing. */
  before?: { title: string | null; body: string | null; updatedAt: Date | null };
}
export const tripNoteStates = new WeakMap<Page, TripNoteApiState>();
export function tripNoteApi(page: Page): TripNoteApiState {
  const value = tripNoteStates.get(page);
  if (!value) throw new Error("Trip note API fixture missing");
  return value;
}
export async function storedTripNotes(tripId: string) {
  return withE2EDb((database) =>
    database
      .select({
        id: notes.id,
        title: notes.title,
        body: notes.body,
        position: notes.position,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(eq(notes.tripId, tripId))
      .orderBy(notes.position)
  );
}
// ── Day edit, append and remove API ─────────────────────────────────────────
export interface StoredDay {
  id: string;
  dayNumber: number;
  date: string | null;
  label: string;
  subtitle: string | null;
  weather: string | null;
  travelSummary: string | null;
}
export async function storedDays(tripId: string): Promise<StoredDay[]> {
  return withE2EDb((database) =>
    database
      .select({
        id: days.id,
        dayNumber: days.dayNumber,
        date: days.date,
        label: days.label,
        subtitle: days.subtitle,
        weather: days.weather,
        travelSummary: days.travelSummary,
      })
      .from(days)
      .where(eq(days.tripId, tripId))
      .orderBy(days.dayNumber)
  );
}
export interface ScopedPackingState {
  tripId: string;
  listId: string;
  listIds: string[];
  defaultId: string;
  response?: APIResponse;
}
export const scopedPackingStates = new WeakMap<Page, ScopedPackingState>();
export function scopedPackingState(page: Page): ScopedPackingState {
  const value = scopedPackingStates.get(page);
  if (!value) throw new Error("Scoped packing order API fixture missing");
  return value;
}
export async function storedScopedPacking(state: ScopedPackingState) {
  const rows = await withE2EDb((database) =>
    database
      .select({
        id: packingItems.id,
        listId: packingItems.listId,
        position: packingItems.position,
        labelId: packingItems.labelId,
      })
      .from(packingItems)
      .where(eq(packingItems.tripId, state.tripId))
  );
  return {
    named: rows
      .filter((row) => row.listId === state.listId)
      .sort((left, right) => left.position - right.position)
      .map((row) => row.id),
    defaultItem: rows.find((row) => row.id === state.defaultId),
  };
}
export interface PackingListApiState {
  tripId: string;
  doomedId: string;
  keptId: string;
  defaultItemId: string;
  created?: { id: string; name: string };
  responses: { status: number; body: unknown }[];
}
export const packingListApiStates = new WeakMap<Page, PackingListApiState>();
export function packingListApi(page: Page): PackingListApiState {
  const value = packingListApiStates.get(page);
  if (!value) throw new Error("Packing list API fixture missing");
  return value;
}
export const pullApiFixtures = new WeakMap<Page, { owned: string; foreign: string; responses: KeyedResult[] }>();
