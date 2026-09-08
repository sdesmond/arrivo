"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentProps, ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SyncConnectionStatus } from "@/data/types";
import type { SyncConnectionStatus as SyncConnectionStatusValue } from "@/data/types";
import { cn } from "@/lib/utils";
import { useLiveSync } from "@/lib/use-live-sync";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Global indicator deliberately accepts no overrides.
export interface SyncStatusIndicatorProps {}

type ProblemStatus = Exclude<SyncConnectionStatusValue, typeof SyncConnectionStatus.Connected>;

interface SyncProblemContent {
  icon: LucideIcon;
  iconName: string;
  label: string;
  textClassName: string;
}

// Every page load opens a fresh channel at `reconnecting` and only reaches `connected` on the SSE
// handshake, so a problem-only indicator would flash a warning on every load. Surface a problem
// only once it outlives this window; an escalation between two problem states is immediate.
const PROBLEM_GRACE_MS = 2_000;

const CONNECTED_LABEL = "Connected";

const PROBLEM_CONTENT: Record<ProblemStatus, SyncProblemContent> = {
  [SyncConnectionStatus.Reconnecting]: {
    icon: RefreshCw,
    iconName: "refresh-cw",
    label: "Reconnecting",
    textClassName: "text-warning",
  },
  [SyncConnectionStatus.Offline]: {
    icon: WifiOff,
    iconName: "wifi-off",
    label: "Unable to sync",
    textClassName: "text-danger",
  },
};

// Single source for both the tooltip label and the announcement, so the two cannot drift.
function getStatusLabel(status: SyncConnectionStatusValue): string {
  return status === SyncConnectionStatus.Connected ? CONNECTED_LABEL : PROBLEM_CONTENT[status].label;
}

function subscribeToReducedMotion(onStoreChange: () => void): () => void {
  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getReducedMotionPreference(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerReducedMotionPreference(): boolean {
  return false;
}

type TooltipOpenChange = NonNullable<ComponentProps<typeof Tooltip>["onOpenChange"]>;

interface SyncProblemBadgeProps {
  status: ProblemStatus;
  animate: boolean;
}

function SyncProblemBadge({ status, animate }: SyncProblemBadgeProps): ReactElement {
  const { icon: StatusIcon, iconName, label, textClassName } = PROBLEM_CONTENT[status];
  // Controlled so a tap opens the tooltip too: the Base UI trigger opens on hover and focus only,
  // which leaves touch users with an icon they cannot read a label off.
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const handleOpenChange: TooltipOpenChange = (nextOpen, details) => {
    // The primitive's only open paths are mouse hover and focus, and it *closes* on a trigger
    // press — which would leave a touch user with no way to read the label. Toggle on press.
    setTooltipOpen(details.reason === "trigger-press" ? (open) => !open : nextOpen);
  };

  // Recovery unmounts this badge. If it still held focus, hand focus to the main region instead of
  // dropping the keyboard user back to <body> mid-session.
  useLayoutEffect(() => {
    return () => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.dataset.testid !== "sync-status-trigger") return;
      const main = document.getElementById("main-content");
      if (!main) return;
      main.tabIndex = -1;
      main.focus();
    };
  }, []);

  return (
    <Tooltip open={tooltipOpen} onOpenChange={handleOpenChange}>
      <TooltipTrigger
        aria-label={label}
        className={cn(
          "pointer-events-auto flex size-11 items-center justify-center rounded-full bg-surface shadow-sm",
          textClassName
        )}
        data-testid="sync-status-trigger"
        style={{ border: "1px solid var(--line)" }}
        type="button"
      >
        <StatusIcon
          aria-hidden="true"
          className={cn("size-5", animate && "animate-pulse")}
          data-icon={iconName}
          data-testid="sync-status-icon"
          strokeWidth={1.5}
        />
      </TooltipTrigger>
      {/* Bottom-anchored trigger, so `top` is the side that never has to flip. The primitive
          renders no `tooltip` role, so tests need a testid we own rather than its `data-slot`. */}
      <TooltipContent data-testid="sync-status-tooltip" side="top">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function SyncStatusIndicator({}: SyncStatusIndicatorProps): ReactElement {
  const status = useLiveSync();
  const [displayedStatus, setDisplayedStatus] = useState<SyncConnectionStatusValue>(SyncConnectionStatus.Connected);
  const displayedStatusRef = useRef<SyncConnectionStatusValue>(SyncConnectionStatus.Connected);
  const previousDisplayedStatus = useRef<SyncConnectionStatusValue | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionPreference,
    getServerReducedMotionPreference
  );

  useEffect(() => {
    const isHealthy = status === SyncConnectionStatus.Connected;
    const isAlreadyShowingProblem = displayedStatusRef.current !== SyncConnectionStatus.Connected;

    if (isHealthy || isAlreadyShowingProblem) {
      // Mirrors the shared channel, which lives outside React; only the first problem after a
      // healthy period waits, and React bails out when the value is unchanged.
      setDisplayedStatus(status);
      return;
    }

    const timer = setTimeout(() => setDisplayedStatus(status), PROBLEM_GRACE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    displayedStatusRef.current = displayedStatus;
    if (previousDisplayedStatus.current !== null && previousDisplayedStatus.current !== displayedStatus) {
      setAnnouncement(getStatusLabel(displayedStatus));
    }
    previousDisplayedStatus.current = displayedStatus;
  }, [displayedStatus]);

  return (
    <div
      data-testid="sync-status-indicator"
      className="pointer-events-none fixed bottom-0 left-4 z-50 flex flex-col items-start pb-4 lg:left-64"
    >
      {displayedStatus === SyncConnectionStatus.Connected ? null : (
        <SyncProblemBadge
          status={displayedStatus}
          animate={displayedStatus === SyncConnectionStatus.Reconnecting && !prefersReducedMotion}
        />
      )}
      {/* Lifts the badge clear of the mobile tab bar (56px) and the notch below it; the bar is
          hidden from `lg` up, where `pb-4` is the whole offset. */}
      <div
        aria-hidden="true"
        className="lg:hidden"
        data-testid="sync-status-safe-area"
        style={{ height: "calc(3.5rem + env(safe-area-inset-bottom))" }}
      />
      <span role="status" aria-live="polite" className="sr-only" data-testid="sync-status-announcement">
        {announcement}
      </span>
    </div>
  );
}
