import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { Page, TestInfo } from "@playwright/test";
import {
  checklistItems,
  collaborators,
  days,
  documents,
  events,
  itineraryChecklists,
  itineraryNotes,
  packingItems,
  packingTemplateItems,
  packingTemplates,
  reservations,
  trips,
  userCompanions,
  userLoyaltyNumbers,
  users,
} from "../../src/db/schema";
import { withE2EDb } from "./e2e-db";
import {
  BASELINE_E2E_USER,
  cloneTemplateMother,
  cloneTripMother,
  cloneUserMother,
  type TemplateMotherName,
  type TemplateMotherOverrides,
  type TripMotherName,
  type TripMotherOverrides,
  type UserMotherName,
  type UserMotherOverrides,
} from "./e2e-seed-data";

type CleanupEntity = "user" | "trip" | "template";

export interface CleanupHandle {
  entity: CleanupEntity;
  id: string;
}

export interface ScenarioUserRecord {
  id: string;
  email: string;
  name: string;
  initials: string;
}

export interface ScenarioTripRecord {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface ScenarioTemplateRecord {
  id: string;
  name: string;
}

export interface ScenarioFixtureRequest {
  user?: {
    mother?: UserMotherName;
    overrides?: UserMotherOverrides;
    setCurrent?: boolean;
  };
  trip?: {
    mother?: TripMotherName;
    overrides?: TripMotherOverrides;
    ownerId?: string;
    setCurrent?: boolean;
  };
  template?: {
    mother?: TemplateMotherName;
    overrides?: TemplateMotherOverrides;
    userId?: string;
    setCurrent?: boolean;
  };
}

export interface ScenarioFixtureResult {
  user?: ScenarioUserRecord;
  trip?: ScenarioTripRecord;
  template?: ScenarioTemplateRecord;
  cleanup: CleanupHandle[];
}

export interface ScenarioFixtureContext {
  currentUser?: ScenarioUserRecord;
  currentTrip?: ScenarioTripRecord;
  currentTemplate?: ScenarioTemplateRecord;
  materialize(request: ScenarioFixtureRequest): Promise<ScenarioFixtureResult>;
  ensureCurrentUser(overrides?: UserMotherOverrides): Promise<ScenarioUserRecord>;
  ensureCurrentTrip(mother?: TripMotherName, overrides?: TripMotherOverrides): Promise<ScenarioTripRecord>;
  ensureCurrentTemplate(
    mother?: TemplateMotherName,
    overrides?: TemplateMotherOverrides
  ): Promise<ScenarioTemplateRecord>;
  signIn(page: Page): Promise<void>;
  signInAsBaseline(page: Page): Promise<void>;
  signOut(): void;
  gotoCurrentTrip(page: Page): Promise<void>;
  uniqueName(label: string): string;
  uniqueEmail(label?: string): string;
  refreshCurrentPage(page: Page): Promise<void>;
  rememberTripByName(name: string): Promise<ScenarioTripRecord>;
  setCurrentTrip(nextTrip: ScenarioTripRecord | undefined): void;
  setCurrentUser(nextUser: ScenarioUserRecord | undefined): void;
  setValue<T>(key: string, value: T): void;
  getValue<T>(key: string): T | undefined;
  clearValue(key: string): void;
}

interface MutableScenarioState {
  cleanup: CleanupHandle[];
  counters: Record<string, number>;
  values: Map<string, unknown>;
  signedInEmail?: string;
  currentUser?: ScenarioUserRecord;
  currentTrip?: ScenarioTripRecord;
  currentTemplate?: ScenarioTemplateRecord;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function createScenarioSeed(testInfo: TestInfo): string {
  return createHash("sha1").update(testInfo.testId).digest("hex").slice(0, 8);
}

export function createScenarioFixtureContext(testInfo: TestInfo): ScenarioFixtureContext {
  const scenarioSeed = createScenarioSeed(testInfo);
  const state: MutableScenarioState = {
    cleanup: [],
    counters: {},
    values: new Map(),
  };

  function nextCounter(label: string): number {
    state.counters[label] = (state.counters[label] ?? 0) + 1;
    return state.counters[label];
  }

  function uniqueName(label: string): string {
    return `${label} ${slugify(testInfo.title)} ${scenarioSeed}-${nextCounter(label)}`;
  }

  function uniqueEmail(label = "user"): string {
    const suffix = `${scenarioSeed}-${nextCounter(label)}`;
    return `e2e+${slugify(label)}-${suffix}@packt.local`;
  }

  function registerCleanup(handle: CleanupHandle): void {
    if (!state.cleanup.some((item) => item.entity === handle.entity && item.id === handle.id)) {
      state.cleanup.push(handle);
    }
  }

  async function loadUserByEmail(email: string): Promise<ScenarioUserRecord> {
    return withE2EDb(async (db) => {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.email, email));

      if (!user?.email) {
        throw new Error(`Could not find user for email "${email}".`);
      }

      const displayName = user.name ?? email;
      return {
        id: user.id,
        email: user.email,
        name: displayName,
        initials: displayName.slice(0, 2).toUpperCase(),
      };
    });
  }

  async function createUser(
    mother: UserMotherName = "default",
    overrides: UserMotherOverrides = {}
  ): Promise<ScenarioUserRecord> {
    const seed = cloneUserMother(mother, overrides);
    const email = uniqueEmail(seed.user.name);
    const passwordHash = await bcrypt.hash(process.env.E2E_PASSWORD!, 10);

    return withE2EDb(async (db) => {
      const [user] = await db
        .insert(users)
        .values({
          email,
          name: seed.user.name,
          passwordHash,
          dateFormat: seed.user.dateFormat,
          currency: seed.user.currency,
          defaultCoverType: seed.user.defaultCoverType,
        })
        .returning({ id: users.id, email: users.email, name: users.name });

      if (seed.loyaltyNumbers.length > 0) {
        await db.insert(userLoyaltyNumbers).values(seed.loyaltyNumbers.map((item) => ({ userId: user.id, ...item })));
      }

      if (seed.companions.length > 0) {
        await db.insert(userCompanions).values(seed.companions.map((item) => ({ userId: user.id, ...item })));
      }

      const createdUser: ScenarioUserRecord = {
        id: user.id,
        email: user.email!,
        name: user.name ?? seed.user.name,
        initials: seed.user.initials,
      };

      registerCleanup({ entity: "user", id: user.id });
      return createdUser;
    });
  }

  async function createTrip(
    mother: TripMotherName = "threeDayTrip",
    overrides: TripMotherOverrides = {},
    ownerId?: string
  ): Promise<ScenarioTripRecord> {
    const owner = ownerId ? undefined : await context.ensureCurrentUser();
    const ownerUserId = ownerId ?? owner?.id;

    if (!ownerUserId) {
      throw new Error("Trip materialization requires an owner user.");
    }

    const ownerUser = owner ?? state.currentUser;
    const seed = cloneTripMother(mother, overrides);

    return withE2EDb(async (db) => {
      const [trip] = await db
        .insert(trips)
        .values({
          ownerId: ownerUserId,
          name: seed.trip.name,
          startDate: seed.trip.startDate ?? null,
          endDate: seed.trip.endDate ?? null,
          coverImageUrl: seed.trip.coverImageUrl ?? null,
          destinationName: seed.trip.destinationName ?? null,
          destinationCountry: seed.trip.destinationCountry ?? null,
          destinationCountryCode: seed.trip.destinationCountryCode ?? null,
        })
        .returning({ id: trips.id, name: trips.name, startDate: trips.startDate, endDate: trips.endDate });

      if (!ownerUser) {
        throw new Error("Trip materialization requires the current user details.");
      }

      await db.insert(collaborators).values({
        tripId: trip.id,
        userId: ownerUserId,
        email: ownerUser.email,
        name: ownerUser.name,
        initials: ownerUser.initials,
        role: "owner",
      });

      const insertedDays =
        seed.days.length > 0
          ? await db
              .insert(days)
              .values(seed.days.map((day) => ({ tripId: trip.id, ...day })))
              .returning({ id: days.id, dayNumber: days.dayNumber })
          : [];
      const dayIdsByNumber = new Map(insertedDays.map((day) => [day.dayNumber, day.id]));

      const eventIdsByName = new Map<string, string>();
      for (const eventSeed of seed.events) {
        const eventValues: typeof events.$inferInsert = {
          tripId: trip.id,
          dayId: eventSeed.dayNumber ? (dayIdsByNumber.get(eventSeed.dayNumber) ?? null) : null,
          name: eventSeed.name,
          position: eventSeed.position,
          startAt: eventSeed.startAt ? new Date(eventSeed.startAt) : null,
          endAt: eventSeed.endAt ? new Date(eventSeed.endAt) : null,
          displacedDate: eventSeed.displacedDate ?? null,
          locationName: eventSeed.locationName ?? null,
          locationAddress: eventSeed.locationAddress ?? null,
          locationLat: eventSeed.locationLat ?? null,
          locationLng: eventSeed.locationLng ?? null,
        };
        const [eventRow] = await db.insert(events).values(eventValues).returning({ id: events.id });
        eventIdsByName.set(eventSeed.name, eventRow.id);
      }

      const labelIdsByName = new Map<string, string>();
      for (const item of seed.packingItems) {
        const [packingRow] = await db
          .insert(packingItems)
          .values({
            tripId: trip.id,
            name: item.name,
            isLabel: item.isLabel,
            done: item.done,
            position: item.position,
            labelId: item.isLabel ? null : item.under ? (labelIdsByName.get(item.under) ?? null) : null,
          })
          .returning({ id: packingItems.id });
        if (item.isLabel) {
          labelIdsByName.set(item.name, packingRow.id);
        }
      }

      for (const noteSeed of seed.notes) {
        const dayId = dayIdsByNumber.get(noteSeed.dayNumber);
        if (!dayId) {
          throw new Error(`Cannot seed note for missing day ${noteSeed.dayNumber}.`);
        }
        await db.insert(itineraryNotes).values({
          dayId,
          content: noteSeed.content,
          position: noteSeed.position,
        });
      }

      for (const checklistSeed of seed.checklists) {
        const dayId = dayIdsByNumber.get(checklistSeed.dayNumber);
        if (!dayId) {
          throw new Error(`Cannot seed checklist for missing day ${checklistSeed.dayNumber}.`);
        }
        const [checklist] = await db
          .insert(itineraryChecklists)
          .values({
            dayId,
            position: checklistSeed.position,
            title: checklistSeed.title ?? null,
          })
          .returning({ id: itineraryChecklists.id });

        if (checklistSeed.items.length > 0) {
          await db.insert(checklistItems).values(
            checklistSeed.items.map((item) => ({
              checklistId: checklist.id,
              content: item.text,
              isChecked: item.isChecked ?? false,
            }))
          );
        }
      }

      const reservationIdsByProvider = new Map<string, string>();
      for (const reservationSeed of seed.reservations) {
        const [insertedReservation] = await db
          .insert(reservations)
          .values({
            tripId: trip.id,
            type: reservationSeed.type,
            provider: reservationSeed.provider,
            startAt: reservationSeed.startAt ? new Date(reservationSeed.startAt) : null,
            endAt: reservationSeed.endAt ? new Date(reservationSeed.endAt) : null,
            startAddress: reservationSeed.startAddress ?? null,
            startLocationName: reservationSeed.startLocationName ?? null,
            startLocationLat: reservationSeed.startLocationLat ?? null,
            startLocationLng: reservationSeed.startLocationLng ?? null,
            endAddress: reservationSeed.endAddress ?? null,
            endLocationName: reservationSeed.endLocationName ?? null,
            endLocationLat: reservationSeed.endLocationLat ?? null,
            endLocationLng: reservationSeed.endLocationLng ?? null,
            confirmationCode: reservationSeed.confirmationCode ?? null,
            notes: reservationSeed.notes ?? null,
          })
          .returning({ id: reservations.id });
        reservationIdsByProvider.set(reservationSeed.provider, insertedReservation.id);
      }

      for (const documentSeed of seed.documents) {
        const eventId = documentSeed.eventName ? (eventIdsByName.get(documentSeed.eventName) ?? null) : null;
        const reservationId = documentSeed.reservationProvider
          ? (reservationIdsByProvider.get(documentSeed.reservationProvider) ?? null)
          : null;
        await db.insert(documents).values({
          tripId: reservationId ? null : trip.id,
          eventId,
          reservationId,
          name: documentSeed.name,
          kind: documentSeed.kind,
          size: documentSeed.size != null ? String(documentSeed.size) : null,
          url: documentSeed.url,
        });
      }

      registerCleanup({ entity: "trip", id: trip.id });

      return {
        id: trip.id,
        name: trip.name,
        startDate: trip.startDate ?? null,
        endDate: trip.endDate ?? null,
      };
    });
  }

  async function createTemplate(
    mother: TemplateMotherName = "emptyTemplate",
    overrides: TemplateMotherOverrides = {},
    userId?: string
  ): Promise<ScenarioTemplateRecord> {
    const owner = userId ? undefined : await context.ensureCurrentUser();
    const templateUserId = userId ?? owner?.id;
    if (!templateUserId) {
      throw new Error("Template materialization requires a user.");
    }

    const seed = cloneTemplateMother(mother, overrides);

    return withE2EDb(async (db) => {
      const [template] = await db
        .insert(packingTemplates)
        .values({ userId: templateUserId, name: seed.template.name })
        .returning({ id: packingTemplates.id, name: packingTemplates.name });

      const labelIdsByName = new Map<string, string>();
      for (const item of seed.items) {
        const [templateItem] = await db
          .insert(packingTemplateItems)
          .values({
            templateId: template.id,
            text: item.text,
            isLabel: item.isLabel,
            position: item.position,
            labelId: item.isLabel ? null : item.under ? (labelIdsByName.get(item.under) ?? null) : null,
          })
          .returning({ id: packingTemplateItems.id });

        if (item.isLabel) {
          labelIdsByName.set(item.text, templateItem.id);
        }
      }

      registerCleanup({ entity: "template", id: template.id });

      return {
        id: template.id,
        name: template.name,
      };
    });
  }

  async function cleanup(): Promise<void> {
    const handles = [...state.cleanup];
    state.cleanup.length = 0;
    state.values.clear();
    state.currentTrip = undefined;
    state.currentTemplate = undefined;
    state.currentUser = undefined;

    await withE2EDb(async (db) => {
      for (const handle of handles.filter((item) => item.entity === "template")) {
        await db.delete(packingTemplates).where(eq(packingTemplates.id, handle.id));
      }

      for (const handle of handles.filter((item) => item.entity === "trip")) {
        await db.delete(trips).where(eq(trips.id, handle.id));
      }

      for (const handle of handles.filter((item) => item.entity === "user")) {
        await db.delete(users).where(eq(users.id, handle.id));
      }
    });
  }

  const context: ScenarioFixtureContext = {
    get currentUser() {
      return state.currentUser;
    },
    get currentTrip() {
      return state.currentTrip;
    },
    get currentTemplate() {
      return state.currentTemplate;
    },
    async materialize(request: ScenarioFixtureRequest): Promise<ScenarioFixtureResult> {
      const createdCleanupCount = state.cleanup.length;
      const result: ScenarioFixtureResult = {
        cleanup: [],
      };

      if (request.user) {
        result.user = await createUser(request.user.mother, request.user.overrides);
        if (request.user.setCurrent ?? true) {
          state.currentUser = result.user;
        }
      }

      if (request.trip) {
        result.trip = await createTrip(request.trip.mother, request.trip.overrides, request.trip.ownerId);
        if (request.trip.setCurrent ?? true) {
          state.currentTrip = result.trip;
        }
      }

      if (request.template) {
        result.template = await createTemplate(
          request.template.mother,
          request.template.overrides,
          request.template.userId
        );
        if (request.template.setCurrent ?? true) {
          state.currentTemplate = result.template;
        }
      }

      result.cleanup = state.cleanup.slice(createdCleanupCount);
      return result;
    },
    async ensureCurrentUser(overrides = {}): Promise<ScenarioUserRecord> {
      if (!state.currentUser) {
        state.currentUser = await createUser("default", overrides);
      }

      return state.currentUser;
    },
    async ensureCurrentTrip(mother = "threeDayTrip", overrides = {}): Promise<ScenarioTripRecord> {
      if (!state.currentTrip) {
        state.currentTrip = await createTrip(mother, overrides);
      }

      return state.currentTrip;
    },
    async ensureCurrentTemplate(mother = "emptyTemplate", overrides = {}): Promise<ScenarioTemplateRecord> {
      if (!state.currentTemplate) {
        state.currentTemplate = await createTemplate(mother, overrides);
      }

      return state.currentTemplate;
    },
    async signIn(page: Page): Promise<void> {
      const user = await context.ensureCurrentUser();
      if (state.signedInEmail === user.email && !page.url().includes("/sign-in")) {
        return;
      }

      await page.context().clearCookies();
      await page.goto("/sign-in");
      await page.getByRole("textbox", { name: "Email" }).fill(user.email);
      await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/trips");
      state.signedInEmail = user.email;
      state.currentUser = user;
    },
    async signInAsBaseline(page: Page): Promise<void> {
      if (state.signedInEmail === BASELINE_E2E_USER.email && !page.url().includes("/sign-in")) {
        return;
      }

      await page.context().clearCookies();
      await page.goto("/sign-in");
      await page.getByRole("textbox", { name: "Email" }).fill(BASELINE_E2E_USER.email);
      await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/trips");
      state.signedInEmail = BASELINE_E2E_USER.email;
      state.currentUser = await loadUserByEmail(BASELINE_E2E_USER.email);
    },
    signOut(): void {
      state.signedInEmail = undefined;
    },
    async gotoCurrentTrip(page: Page): Promise<void> {
      const trip = await context.ensureCurrentTrip();
      await page.goto(`/trips/${trip.id}?e2e=${scenarioSeed}-${nextCounter("trip-route")}`);
      await page.waitForURL(/\/trips\/.+/);
    },
    uniqueName,
    uniqueEmail,
    async refreshCurrentPage(page: Page): Promise<void> {
      await page.reload();
      await page.waitForLoadState("networkidle");
    },
    async rememberTripByName(name: string): Promise<ScenarioTripRecord> {
      const owner =
        state.currentUser ??
        (state.signedInEmail ? await loadUserByEmail(state.signedInEmail) : await context.ensureCurrentUser());
      const rememberedTrip = await withE2EDb(async (db) => {
        const [trip] = await db
          .select({ id: trips.id, name: trips.name, startDate: trips.startDate, endDate: trips.endDate })
          .from(trips)
          .where(and(eq(trips.ownerId, owner.id), eq(trips.name, name)));
        if (!trip) {
          throw new Error(`Could not find trip named "${name}" for the current scenario user.`);
        }
        return {
          id: trip.id,
          name: trip.name,
          startDate: trip.startDate ?? null,
          endDate: trip.endDate ?? null,
        };
      });
      registerCleanup({ entity: "trip", id: rememberedTrip.id });
      state.currentTrip = rememberedTrip;
      return rememberedTrip;
    },
    setCurrentTrip(nextTrip: ScenarioTripRecord | undefined): void {
      state.currentTrip = nextTrip;
    },
    setCurrentUser(nextUser: ScenarioUserRecord | undefined): void {
      state.currentUser = nextUser;
    },
    setValue<T>(key: string, value: T): void {
      state.values.set(key, value);
    },
    getValue<T>(key: string): T | undefined {
      return state.values.get(key) as T | undefined;
    },
    clearValue(key: string): void {
      state.values.delete(key);
    },
  };

  (context as ScenarioFixtureContext & { cleanup?: () => Promise<void> }).cleanup = cleanup;

  return context;
}

export async function cleanupScenarioFixtureContext(context: ScenarioFixtureContext): Promise<void> {
  const cleanup = (context as ScenarioFixtureContext & { cleanup?: () => Promise<void> }).cleanup;
  if (cleanup) {
    await cleanup();
  }
}
