"use client";

import { useTransition } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import type { TrustedDeviceSummary } from "@/data/types";
import { removeTrustedDevice } from "./security-actions";

interface TrustedDevicesListProps {
  devices: TrustedDeviceSummary[];
}

const DETAIL_STYLE: React.CSSProperties = { fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)" };

const formatDate = (iso: string) => format(parseISO(iso), "MMM d, yyyy");

export function TrustedDevicesList({ devices }: TrustedDevicesListProps) {
  const [isPending, startTransition] = useTransition();

  if (devices.length === 0) {
    return <p style={DETAIL_STYLE}>No browsers yet.</p>;
  }

  return (
    <ul aria-label="Your browsers" className="flex flex-col gap-2">
      {devices.map((device) => (
        <li
          key={device.id}
          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
          style={{ border: "1px solid var(--line)" }}
        >
          <div className="flex min-w-0 flex-col">
            <span style={{ color: "var(--fg)" }}>
              {device.label}
              {device.isCurrent && <span style={{ color: "var(--fg-2)" }}> · This browser</span>}
            </span>
            <span style={DETAIL_STYLE}>Last used {formatDate(device.lastUsedAt)}</span>
            {device.mfaRememberedUntil && (
              <span style={DETAIL_STYLE}>Skips two-factor until {formatDate(device.mfaRememberedUntil)}</span>
            )}
          </div>
          <Button
            variant="outline"
            className="h-11 shrink-0"
            aria-label={`Remove ${device.label}${device.isCurrent ? " (this browser)" : ""}`}
            disabled={isPending}
            onClick={() => startTransition(() => removeTrustedDevice(device.id))}
          >
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}
