import "server-only";

import { z } from "zod";
import { assertWithinRateLimit } from "@/lib/rate-limit";
import { isHttpUrl } from "@/lib/url-policy";
import { MAX_COVER_SEARCH_PAGE, MAX_COVER_SEARCH_PAGE_SIZE } from "@/lib/validation-limits";
import { MAX_COVER_PHOTOGRAPHER_LENGTH } from "@/lib/api/contract/covers";
import { SearchBoxCore, SessionToken } from "@mapbox/search-js-core";
import type { SearchBoxAdministrativeUnitTypes, SearchBoxSuggestion } from "@mapbox/search-js-core";
import type { Actor, CoverImageSearchResult } from "@/data/types";

interface SearchCoverImagesOptions {
  page?: number;
  perPage?: number;
}

const httpUrl = z.string().refine(isHttpUrl);
// Provider responses are untrusted. A result is kept only when the cover PUT would accept what it carries.
const unsplashResult = z.object({
  id: z.string().min(1),
  urls: z.object({ regular: httpUrl }),
  user: z.object({
    name: z.string().trim().min(1).max(MAX_COVER_PHOTOGRAPHER_LENGTH),
    links: z.object({ html: httpUrl }),
  }),
  alt_description: z.string().nullish(),
  description: z.string().nullish(),
});
const unsplashResponse = z.object({ results: z.array(z.unknown()) });
const mapboxCoordinates = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const DEFAULT_COVER_IMAGE_PAGE = 1;
const DEFAULT_COVER_IMAGE_PAGE_SIZE = 19;
const LOCATION_TYPES: SearchBoxAdministrativeUnitTypes[] = ["place", "locality", "neighborhood", "region", "country"];

function simplifySearchQuery(query: string): string {
  const parts = query
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 2) return query;
  return `${parts[0]}, ${parts[1]}`;
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXmlText(text: string): string {
  return text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

function buildE2EUnsplashStub(query: string, page: number, perPage: number): CoverImageSearchResult[] {
  const label = escapeXmlText(query);
  const slug = query
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const pageStart = (page - 1) * perPage;

  return Array.from({ length: perPage }, (_, index) => {
    const imageNumber = pageStart + index + 1;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#dbeafe"/><text x="60" y="56" font-size="14" text-anchor="middle" fill="#1e3a8a">${label}</text><text x="60" y="78" font-size="12" text-anchor="middle" fill="#1e3a8a">Stub ${imageNumber}</text></svg>`;

    return {
      id: `stub-${slug}-${imageNumber}`,
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      photographer: `Stub Photographer ${imageNumber}`,
      photographerUrl: `https://unsplash.com/@stub-photographer-${imageNumber}`,
      alt: `${query} travel photo ${imageNumber}`,
    };
  });
}

export async function resolveDestinationCenter(
  actor: Actor,
  destinationName: string
): Promise<[number, number] | null> {
  if (!destinationName.trim()) return null;

  if (process.env.E2E_MAPBOX_STUB === "true") {
    return [2.3488, 48.8534];
  }

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return null;

  assertWithinRateLimit("mapboxSearch", actor.userId);

  const sessionToken = crypto.randomUUID();
  const search = new SearchBoxCore({ accessToken: token });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const suggest = await search.suggest(destinationName, {
      sessionToken: new SessionToken(sessionToken),
      types: new Set(LOCATION_TYPES),
      limit: 1,
      signal: controller.signal,
    });

    const first = suggest.suggestions[0];
    if (!first?.mapbox_id) return null;

    const retrieved = await search.retrieve({ mapbox_id: first.mapbox_id } as unknown as SearchBoxSuggestion, {
      sessionToken: new SessionToken(sessionToken),
      signal: controller.signal,
    });

    const parsed = mapboxCoordinates.safeParse(retrieved.features[0]?.geometry?.coordinates);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchCoverImages(
  actor: Actor,
  query: string,
  options: SearchCoverImagesOptions = {}
): Promise<CoverImageSearchResult[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  const page = options.page ?? DEFAULT_COVER_IMAGE_PAGE;
  const perPage = options.perPage ?? DEFAULT_COVER_IMAGE_PAGE_SIZE;

  if (!key && process.env.E2E_UNSPLASH_STUB !== "true") {
    throw new Error("UNSPLASH_ACCESS_KEY is not configured");
  }

  if (!query.trim()) {
    throw new Error("Search query must not be empty");
  }

  if (!Number.isInteger(page) || page < 1 || page > MAX_COVER_SEARCH_PAGE) {
    throw new Error(`Search page must be a whole number from 1 to ${MAX_COVER_SEARCH_PAGE}`);
  }

  if (!Number.isInteger(perPage) || perPage < 1 || perPage > MAX_COVER_SEARCH_PAGE_SIZE) {
    throw new Error(`Search page size must be a whole number from 1 to ${MAX_COVER_SEARCH_PAGE_SIZE}`);
  }

  if (process.env.E2E_UNSPLASH_STUB === "true") {
    return buildE2EUnsplashStub(query, page, perPage);
  }

  assertWithinRateLimit("unsplashSearch", actor.userId);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const searchQuery = simplifySearchQuery(query);
    const encodedQuery = encodeURIComponent(searchQuery);
    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodedQuery}+travel&orientation=landscape&page=${page}&per_page=${perPage}`,
      {
        signal: controller.signal,
        headers: {
          Authorization: `Client-ID ${key}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Unsplash search error: ${response.status}`);
    }

    const body = unsplashResponse.safeParse(await response.json());
    if (!body.success) throw new Error("Unsplash returned an unexpected response");
    const results: CoverImageSearchResult[] = [];
    for (const candidate of body.data.results) {
      const parsed = unsplashResult.safeParse(candidate);
      if (!parsed.success) continue;
      const result = parsed.data;
      results.push({
        id: result.id,
        url: result.urls.regular,
        photographer: result.user.name,
        photographerUrl: result.user.links.html,
        alt: result.alt_description ?? result.description ?? "",
      });
    }
    const dropped = body.data.results.length - results.length;
    if (dropped > 0) console.warn(`[cover-search] dropped ${dropped} malformed Unsplash result(s)`);
    return results;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Unsplash search request failed: ${error.message}`, { cause: error });
    }
    throw new Error("Unsplash search request failed: Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}
