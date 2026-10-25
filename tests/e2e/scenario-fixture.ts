import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import { TransitMode } from "../../src/data/types";
import {
  checklistItems,
  collaborators,
  days,
  documents,
  events,
  expenses,
  itineraryChecklists,
  itineraryNotes,
  notes,
  packingItems,
  packingTemplateItems,
  packingTemplates,
  reservations,
  tripPackingLists,
  trips,
  userCompanions,
  userLoyaltyNumbers,
  users,
} from "../../src/db/schema";
import { withE2EDb } from "./e2e-db";
import { setInstanceState, type InstanceStateName } from "./instance-state";
import {
  BASELINE_E2E_USER,
  cloneTemplateMother,
  cloneTripMother,
  cloneUserMother,
  type TemplateMotherName,
  type TemplateMotherOverrides,
  type TripMother,
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
  username: string;
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
  /** Plain username/password sign-in, for a session other than the scenario's own current user. */
  signInAsUser(page: Page, username: string): Promise<void>;
  signOut(): void;
  /** Sets the singleton instance state for this scenario; cleanup restores "initialized". */
  setInstanceState(name: InstanceStateName): Promise<void>;
  gotoCurrentTrip(page: Page): Promise<void>;
  uniqueName(label: string): string;
  uniqueUsername(label?: string): string;
  rememberTripByName(name: string): Promise<ScenarioTripRecord>;
  /** Materializes a user and seeds them as a collaborator on `tripId` — a second session's account. */
  seedCollaborator(
    tripId: string,
    name: string,
    initials: string,
    role: "editor" | "manager"
  ): Promise<ScenarioUserRecord>;
  /** Opens a fresh browser context + page from `page`'s browser, for a second concurrent session. */
  openSecondSession(page: Page): Promise<{ context: BrowserContext; page: Page }>;
  setCurrentTrip(nextTrip: ScenarioTripRecord | undefined): void;
  setCurrentUser(nextUser: ScenarioUserRecord | undefined): void;
  setValue<T>(key: string, value: T): void;
  getValue<T>(key: string): T | undefined;
  clearValue(key: string): void;
  /**
   * Registers a raw-seeded row for scenario cleanup. Deleting a "user" cascades its owned trips and
   * invitations via FK, so a step that seeds a second (non-current) account only needs to register
   * that user — it does not need its own trip/invitation cleanup handles.
   */
  registerCleanup(handle: CleanupHandle): void;
}

interface MutableScenarioState {
  cleanup: CleanupHandle[];
  counters: Record<string, number>;
  values: Map<string, unknown>;
  signedInUsername?: string;
  instanceStateChanged?: boolean;
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

function assertEventLinkIsUnique(
  eventName: string | undefined,
  rowType: "document" | "expense",
  eventCountsByName: Map<string, number>
): void {
  if (!eventName) return;

  const matchingEventCount = eventCountsByName.get(eventName) ?? 0;
  if (matchingEventCount === 0) {
    throw new Error(`Cannot seed ${rowType} for missing event "${eventName}".`);
  }
  if (matchingEventCount > 1) {
    throw new Error(`Cannot seed ${rowType} for duplicate event name "${eventName}".`);
  }
}

function validateEventLinks(seed: Pick<TripMother, "events" | "documents" | "expenses">): void {
  const eventCountsByName = new Map<string, number>();
  for (const eventSeed of seed.events) {
    eventCountsByName.set(eventSeed.name, (eventCountsByName.get(eventSeed.name) ?? 0) + 1);
  }

  for (const documentSeed of seed.documents) {
    assertEventLinkIsUnique(documentSeed.eventName, "document", eventCountsByName);
  }
  for (const expenseSeed of seed.expenses) {
    assertEventLinkIsUnique(expenseSeed.eventName, "expense", eventCountsByName);
  }
}

function resolveEventId(
  eventName: string | undefined,
  rowType: "document" | "expense",
  eventIdsByName: Map<string, string>
): string | null {
  if (!eventName) return null;

  const eventId = eventIdsByName.get(eventName);
  if (!eventId) {
    throw new Error(`Cannot seed ${rowType} for missing event "${eventName}".`);
  }
  return eventId;
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

  // Kept within the 30-character username limit: a short label stem plus the scenario seed and a counter.
  function uniqueUsername(label = "user"): string {
    const stem = slugify(label).slice(0, 14).replace(/-+$/, "") || "user";
    return `${stem}-${scenarioSeed}-${nextCounter(label)}`;
  }

  function registerCleanup(handle: CleanupHandle): void {
    if (!state.cleanup.some((item) => item.entity === handle.entity && item.id === handle.id)) {
      state.cleanup.push(handle);
    }
  }

  async function loadUserByUsername(username: string): Promise<ScenarioUserRecord> {
    return withE2EDb(async (db) => {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
        })
        .from(users)
        .where(eq(users.username, username));

      if (!user) {
        throw new Error(`Could not find user "${username}".`);
      }

      const displayName = user.name ?? username;
      return {
        id: user.id,
        username: user.username,
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
    const username = uniqueUsername(seed.user.name);
    const passwordHash = await bcrypt.hash(process.env.E2E_PASSWORD!, 10);

    return withE2EDb(async (db) => {
      const [user] = await db
        .insert(users)
        .values({
          username,
          name: seed.user.name,
          passwordHash,
          role: seed.user.role ?? "member",
          dateFormat: seed.user.dateFormat,
          currency: seed.user.currency ?? "USD",
          defaultCoverType: seed.user.defaultCoverType,
        })
        .returning({ id: users.id, username: users.username, name: users.name });

      if (seed.loyaltyNumbers.length > 0) {
        await db.insert(userLoyaltyNumbers).values(seed.loyaltyNumbers.map((item) => ({ userId: user.id, ...item })));
      }

      if (seed.companions.length > 0) {
        await db.insert(userCompanions).values(seed.companions.map((item) => ({ userId: user.id, ...item })));
      }

      const createdUser: ScenarioUserRecord = {
        id: user.id,
        username: user.username,
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
    const seed = cloneTripMother(mother, overrides);
    validateEventLinks(seed);

    const owner = ownerId ? undefined : await context.ensureCurrentUser();
    const ownerUserId = ownerId ?? owner?.id;

    if (!ownerUserId) {
      throw new Error("Trip materialization requires an owner user.");
    }

    const ownerUser = owner ?? state.currentUser;

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
          transitMode: seed.trip.transitMode ?? TransitMode.Drive,
          budgetCurrency: seed.trip.budgetCurrency ?? null,
          budgetTotal: seed.trip.budgetTotal != null ? seed.trip.budgetTotal.toString() : null,
        })
        .returning({ id: trips.id, name: trips.name, startDate: trips.startDate, endDate: trips.endDate });

      if (!ownerUser) {
        throw new Error("Trip materialization requires the current user details.");
      }

      await db.insert(collaborators).values({
        tripId: trip.id,
        userId: ownerUserId,
        name: ownerUser.name,
        initials: ownerUser.initials,
        role: "manager",
        isCreator: true,
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

      for (const listSeed of seed.packingLists) {
        const [packingList] = await db
          .insert(tripPackingLists)
          .values({ tripId: trip.id, name: listSeed.name, position: listSeed.position })
          .returning({ id: tripPackingLists.id });
        const listLabelIdsByName = new Map<string, string>();
        for (const item of listSeed.items) {
          const [packingRow] = await db
            .insert(packingItems)
            .values({
              tripId: trip.id,
              listId: packingList.id,
              name: item.name,
              isLabel: item.isLabel,
              done: item.done,
              position: item.position,
              labelId: item.isLabel ? null : item.under ? (listLabelIdsByName.get(item.under) ?? null) : null,
            })
            .returning({ id: packingItems.id });
          if (item.isLabel) listLabelIdsByName.set(item.name, packingRow.id);
        }
      }

      if (seed.tripNotes.length > 0) {
        await db.insert(notes).values(
          seed.tripNotes.map((noteSeed) => ({
            tripId: trip.id,
            title: noteSeed.title,
            position: noteSeed.position,
          }))
        );
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
        const eventId = resolveEventId(documentSeed.eventName, "document", eventIdsByName);
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

      if (seed.expenses.length > 0) {
        await db.insert(expenses).values(
          seed.expenses.map((item) => ({
            tripId: trip.id,
            eventId: resolveEventId(item.eventName, "expense", eventIdsByName),
            category: item.category,
            amount: item.amount.toString(),
            currency: item.currency,
            convertedAmountProfile: (item.convertedAmountProfile ?? item.amount).toString(),
            date: item.date,
          }))
        );
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

    if (state.instanceStateChanged) {
      state.instanceStateChanged = false;
      await setInstanceState("initialized");
    }
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
    async setInstanceState(name: InstanceStateName): Promise<void> {
      state.instanceStateChanged = true;
      await setInstanceState(name);
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
      if (state.signedInUsername === user.username && !page.url().includes("/sign-in")) {
        return;
      }

      await page.context().clearCookies();
      await page.goto("/sign-in");
      await page.getByRole("textbox", { name: "Username" }).fill(user.username);
      await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/trips");
      state.signedInUsername = user.username;
      state.currentUser = user;
    },
    async signInAsBaseline(page: Page): Promise<void> {
      if (state.signedInUsername === BASELINE_E2E_USER.username && !page.url().includes("/sign-in")) {
        return;
      }

      await page.context().clearCookies();
      await page.goto("/sign-in");
      await page.getByRole("textbox", { name: "Username" }).fill(BASELINE_E2E_USER.username);
      await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/trips");
      state.signedInUsername = BASELINE_E2E_USER.username;
      state.currentUser = await loadUserByUsername(BASELINE_E2E_USER.username);
    },
    async signInAsUser(page: Page, username: string): Promise<void> {
      await page.goto("/sign-in");
      await page.getByRole("textbox", { name: "Username" }).fill(username);
      await page.getByRole("textbox", { name: "Password" }).fill(process.env.E2E_PASSWORD!);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL("**/trips");
    },
    signOut(): void {
      state.signedInUsername = undefined;
    },
    async gotoCurrentTrip(page: Page): Promise<void> {
      const trip = await context.ensureCurrentTrip();
      await page.goto(`/trips/${trip.id}?e2e=${scenarioSeed}-${nextCounter("trip-route")}`);
      await page.waitForURL(/\/trips\/.+/);
    },
    uniqueName,
    uniqueUsername,
    async seedCollaborator(
      tripId: string,
      name: string,
      initials: string,
      role: "editor" | "manager"
    ): Promise<ScenarioUserRecord> {
      const { user: contributor } = await context.materialize({
        user: { overrides: { user: { name, initials } }, setCurrent: false },
      });
      if (!contributor) throw new Error(`Failed to materialize the ${role} user "${name}".`);

      await withE2EDb(async (db) => {
        await db.insert(collaborators).values({
          tripId,
          userId: contributor.id,
          name: contributor.name,
          initials: contributor.initials,
          role,
          isCreator: false,
        });
      });

      return contributor;
    },
    async openSecondSession(page: Page): Promise<{ context: BrowserContext; page: Page }> {
      const browser = page.context().browser();
      if (!browser) throw new Error("No browser is available to open a second session.");

      const browserContext = await browser.newContext();
      const secondPage = await browserContext.newPage();
      return { context: browserContext, page: secondPage };
    },
    async rememberTripByName(name: string): Promise<ScenarioTripRecord> {
      const owner =
        state.currentUser ??
        (state.signedInUsername ? await loadUserByUsername(state.signedInUsername) : await context.ensureCurrentUser());
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
    registerCleanup,
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
