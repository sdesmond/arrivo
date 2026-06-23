"use client";

import { useState } from "react";
import { WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOffline } from "@/components/providers/offline-provider";
import { cn } from "@/lib/utils";

interface ConnectivityIndicatorProps {
  variant?: "outline" | "ghost";
  iconSize?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ConnectivityIndicator({
  variant = "outline",
  iconSize = 14,
  className,
  style,
}: ConnectivityIndicatorProps) {
  const { offline } = useOffline();

  if (!offline) return null;

  return <OfflineConnectivityIndicator variant={variant} iconSize={iconSize} className={className} style={style} />;
}

function OfflineConnectivityIndicator({ variant, iconSize, className, style }: ConnectivityIndicatorProps) {
  const [isMessageVisible, setIsMessageVisible] = useState(false);

  return (
    <div className="relative">
      <Button
        variant={variant}
        size="icon-sm"
        aria-label="Offline"
        title="Offline"
        className={className}
        style={style}
        onClick={() => setIsMessageVisible((visible) => !visible)}
      >
        <WifiOff size={iconSize} strokeWidth={1.5} />
      </Button>
      {isMessageVisible ? (
        <div
          role="status"
          className={cn("absolute right-0 top-full z-50 mt-2 flex items-start gap-2 rounded-lg p-3")}
          style={{
            width: 260,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-3, 0 4px 12px rgba(0,0,0,0.15))",
          }}
        >
          <span style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--fg)", flex: 1 }}>
            You&apos;re offline. Any changes you make will be synced when you&apos;re back online.
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => setIsMessageVisible(false)}
            style={{ color: "var(--fg-3)" }}
          >
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
