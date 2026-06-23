"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOffline } from "@/components/providers/offline-provider";
import { toast } from "sonner";

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

  return (
    <Button
      variant={variant}
      size="icon-sm"
      aria-label="Offline"
      title="Offline"
      className={className}
      style={style}
      onClick={() =>
        toast.info("You're offline. Any changes you make will be synced when you're back online.", {
          position: "top-center",
        })
      }
    >
      <WifiOff size={iconSize} strokeWidth={1.5} />
    </Button>
  );
}
