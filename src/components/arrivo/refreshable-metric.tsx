"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useBrowserLocale, useBrowserTimeZone } from "@/lib/browser-time-zone";
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
  const timeId = useId();
  const timeZone = useBrowserTimeZone();
  const locale = useBrowserLocale();
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

  const checkedText = `Checked ${new Date(metric.checkedAt).toLocaleTimeString(locale, { timeZone })}`;
  const controls = (
    <div className="flex items-center">
      <time id={timeId} dateTime={metric.checkedAt} className="sr-only">
        {checkedText}
      </time>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label={`${action} ${label}`}
              aria-describedby={timeId}
              disabled={pending}
              focusableWhenDisabled
              onClick={refreshMetric}
            />
          }
        >
          <RefreshCw strokeWidth={1.5} className={pending ? "animate-spin" : undefined} aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent role="tooltip">{checkedText}</TooltipContent>
      </Tooltip>
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </span>
    </div>
  );
  return children(metric, controls, stale);
}
