import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import { TransitMode } from "@/data/types";
import type { GeoCoords, TripEvent } from "@/data/types";

interface DistanceBody {
  origin: GeoCoords;
  destination: GeoCoords;
  transitMode: TransitMode;
}

interface DayRouteBody {
  events: TripEvent[];
  transitMode: TransitMode;
  walkThresholdMeters: number | null;
}

const TRANSIT_MODES: readonly string[] = Object.values(TransitMode);

function isTransitMode(value: unknown): value is TransitMode {
  return typeof value === "string" && TRANSIT_MODES.includes(value);
}

function isGeoCoords(value: unknown): value is GeoCoords {
  if (typeof value !== "object" || value === null) return false;
  const { lat, lng } = value as Record<string, unknown>;
  return typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng);
}

export async function assertEventsBelongToTrip(tripId: string, events: TripEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const eventIds = events.map((event) => event.id);
  const ownedEvents = await db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(and(eq(eventsTable.tripId, tripId), inArray(eventsTable.id, eventIds)));
  const ownedEventIds = new Set(ownedEvents.map((event) => event.id));

  if (eventIds.some((eventId) => !ownedEventIds.has(eventId))) {
    throw new Error("Event(s) do not belong to trip");
  }
}

/** The request's JSON body when it is an object; null for malformed JSON or any other JSON shape. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function parseDistanceBody(body: Record<string, unknown>): DistanceBody | null {
  const { origin, destination, transitMode } = body;
  if (!isGeoCoords(origin) || !isGeoCoords(destination) || !isTransitMode(transitMode)) return null;
  return { origin, destination, transitMode };
}

export function parseDayRouteBody(body: Record<string, unknown>): DayRouteBody | null {
  const { events, transitMode, walkThresholdMeters } = body;
  if (!Array.isArray(events) || !events.every((event) => typeof event?.id === "string")) return null;
  if (!isTransitMode(transitMode)) return null;
  if (walkThresholdMeters != null && typeof walkThresholdMeters !== "number") return null;
  return { events: events as TripEvent[], transitMode, walkThresholdMeters: walkThresholdMeters ?? null };
}

export function routeJson(payload: unknown): Response {
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}

export function badRouteRequest(): Response {
  return Response.json({ error: "Invalid routing request" }, { status: 400 });
}
