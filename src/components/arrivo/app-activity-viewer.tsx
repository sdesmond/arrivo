"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loadActivityPage } from "@/app/(app)/admin/activity/actions";
import { Button } from "@/components/ui/button";
import type { ActivityLoadResult, ActivityPage, ActivityQuery } from "@/data/types";
import { formatInstant } from "@/lib/activity-dates";
import { ActivityFilters, hasActivityFilters } from "./activity-filters";
import { AppActivity } from "./app-activity";

export interface AppActivityViewerProps {
  initialQuery: ActivityQuery;
  initialPage: ActivityPage;
}

type View = { kind: "page"; query: ActivityQuery; page: ActivityPage } | { kind: "forbidden" };

const SERVER_ZONE = "UTC";
const subscribeToZone = () => () => {};
const readBrowserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || SERVER_ZONE;
const readServerZone = () => SERVER_ZONE;

function toSearch(query: ActivityQuery): string {
  const params = new URLSearchParams();
  if (query.actorId) params.set("actor", query.actorId);
  if (query.type) params.set("type", query.type);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.cursor) params.set("cursor", query.cursor);
  const text = params.toString();
  return text ? `?${text}` : "";
}

function withoutCursor(query: ActivityQuery): ActivityQuery {
  const next = { ...query };
  delete next.cursor;
  return next;
}

export function AppActivityViewer({ initialQuery, initialPage }: AppActivityViewerProps) {
  const timeZone = useSyncExternalStore(subscribeToZone, readBrowserZone, readServerZone);
  const [view, setView] = useState<View>({ kind: "page", query: initialQuery, page: initialPage });
  const [requested, setRequested] = useState<ActivityQuery>(initialQuery);
  // The cursor stack that belongs to `requested`, so Retry after a failed page change replays both together.
  const [requestedNewerCursors, setRequestedNewerCursors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Cursors of the pages newer than the current one; client-held, so a reload offers only "Newest".
  const [newerCursors, setNewerCursors] = useState<string[]>([]);
  const latestRequest = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const focusResults = useRef(false);

  useEffect(() => {
    if (!loading && focusResults.current) {
      focusResults.current = false;
      resultsRef.current?.focus();
    }
  }, [loading, view]);

  async function load(next: ActivityQuery, nextNewerCursors: string[], moveFocus = false) {
    const request = ++latestRequest.current;
    setRequested(next);
    setRequestedNewerCursors(nextNewerCursors);
    setLoading(true);
    setFailed(false);
    focusResults.current = moveFocus;
    let result: ActivityLoadResult;
    try {
      result = await loadActivityPage(next);
    } catch {
      result = { status: "unavailable" };
    }
    // A newer request owns the screen; its answer is the one to show.
    if (request !== latestRequest.current) return;
    setLoading(false);
    if (result.status === "ok") {
      const page: ActivityPage = {
        events: result.events,
        actors: result.actors,
        loadedAt: result.loadedAt,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        ...(result.invalidRange ? { invalidRange: true } : {}),
      };
      setView({ kind: "page", query: next, page });
      setNewerCursors(nextNewerCursors);
      window.history.replaceState(null, "", `${window.location.pathname}${toSearch(next)}`);
    } else if (result.status === "forbidden") {
      setView({ kind: "forbidden" });
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      setFailed(true);
    }
  }

  if (view.kind === "forbidden") {
    return (
      <p role="alert" className="mt-4 text-sm" style={{ color: "var(--fg-2)" }}>
        You no longer have administrator access.
      </p>
    );
  }

  const { page, query } = view;
  const filtered = hasActivityFilters(query);
  const loadedAt = <time dateTime={page.loadedAt}>{formatInstant(page.loadedAt, timeZone)}</time>;

  return (
    <div>
      <ActivityFilters
        query={requested}
        actors={page.actors}
        timeZone={timeZone}
        rangeError={Boolean(page.invalidRange) && !loading && !failed}
        onChange={(next) => void load(next, [])}
        onClear={() => void load({}, [])}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="lg" onClick={() => void load(requested, requestedNewerCursors)}>
          Refresh
        </Button>
        <span className="text-xs" style={{ color: "var(--fg-3)" }}>
          Loaded {loadedAt}
        </span>
      </div>
      {failed ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--fg)" }}>
          <span>Could not load activity. Showing results from {loadedAt}, which may be out of date.</span>
          <Button type="button" variant="outline" size="lg" onClick={() => void load(requested, requestedNewerCursors)}>
            Retry
          </Button>
        </div>
      ) : null}
      <div
        ref={resultsRef}
        tabIndex={-1}
        aria-busy={loading}
        aria-label="Activity results"
        role="region"
        className="outline-none"
      >
        {loading ? (
          <p role="status" className="mt-4 text-sm" style={{ color: "var(--fg-3)" }}>
            Loading activity…
          </p>
        ) : page.events.length === 0 ? (
          <p role="status" className="mt-4 text-sm" style={{ color: "var(--fg-3)" }}>
            {filtered ? "No activity matches these filters." : "No activity recorded yet."}
          </p>
        ) : (
          <AppActivity events={page.events} timeZone={timeZone} />
        )}
      </div>
      {loading ? null : (
        <nav aria-label="Activity pages" className="mt-4 flex flex-wrap gap-3">
          {query.cursor ? (
            <Button type="button" variant="outline" size="lg" onClick={() => void load(withoutCursor(query), [], true)}>
              Newest
            </Button>
          ) : null}
          {newerCursors.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => {
                const previous = newerCursors[newerCursors.length - 1];
                void load(
                  { ...withoutCursor(query), ...(previous ? { cursor: previous } : {}) },
                  newerCursors.slice(0, -1),
                  true
                );
              }}
            >
              Newer
            </Button>
          ) : null}
          {page.nextCursor ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() =>
                void load({ ...query, cursor: page.nextCursor }, [...newerCursors, query.cursor ?? ""], true)
              }
            >
              Older
            </Button>
          ) : null}
        </nav>
      )}
    </div>
  );
}
