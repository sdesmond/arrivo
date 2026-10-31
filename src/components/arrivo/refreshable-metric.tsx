"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Metric } from "@/lib/overview-metric";

export interface RefreshableMetricProps<Value> {
  label: string;
  initialMetric: Metric<Value>;
  refresh: () => Promise<Metric<Value>>;
  children: (metric: Metric<Value>, controls: ReactNode, stale: boolean) => ReactNode;
}

export function RefreshableMetric<Value>({ label, initialMetric, refresh, children }: RefreshableMetricProps<Value>) {
  const [metric, setMetric] = useState(initialMetric);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inFlight = useRef(false);
  const stale = failed && metric.status === "ok";
  const action = failed || metric.status === "unavailable" ? "Retry" : "Refresh";

  async function refreshMetric() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setAnnouncement(`Refreshing ${label}…`);
    try {
      const result = await refresh();
      if (result.status === "ok") {
        setMetric(result);
        setFailed(false);
        setAnnouncement(`${label} refreshed.`);
      } else {
        failRefresh(result);
      }
    } catch {
      failRefresh();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function failRefresh(result?: Metric<Value>) {
    setFailed(true);
    if (metric.status === "unavailable" && result) setMetric(result);
    setAnnouncement(
      metric.status === "ok"
        ? `${label} could not be refreshed. Previous value is stale.`
        : `${label} is unavailable. Try again.`
    );
  }

  const controls = (
    <div className="flex items-center">
      <Button
        variant="ghost"
        className="h-11"
        aria-label={`${action} ${label}`}
        disabled={pending}
        focusableWhenDisabled
        onClick={refreshMetric}
      >
        {pending ? "Refreshing…" : action}
      </Button>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </span>
    </div>
  );
  return children(metric, controls, stale);
}
