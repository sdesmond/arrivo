"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { getTint } from "@/lib/trip-tints";
import { cn } from "@/lib/utils";

interface TripCoverProps {
  name: string;
  country?: string;
  metaTag?: string;
  showCity?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function TripCover({ name, country, metaTag, showCity = true, className, style }: TripCoverProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const dark = mounted && resolvedTheme === "dark";
  const tint = getTint(name, dark);

  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: tint, ...style }}>
      {/* Stripes overlay */}
      <div className="cover-stripes absolute inset-0" />

      {/* Meta tag (top-left) */}
      {metaTag && (
        <div
          className="absolute left-3 top-2.5 z-10"
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "calc(10.5px * var(--font-scale))",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--fg-3)",
            background: "var(--bg)",
            border: "1px solid var(--line)",
            padding: "3px 7px",
            borderRadius: 4,
          }}
        >
          {metaTag}
        </div>
      )}

      {/* City overlay (bottom-left) */}
      {showCity && (
        <div
          className="absolute bottom-3.5 left-3.5 z-10"
          style={{
            fontFamily: "var(--font-heading-family, ui-sans-serif)",
            fontWeight: 700,
            fontSize: "calc(26px * var(--font-scale))",
            letterSpacing: "-0.02em",
            color: "var(--fg)",
            lineHeight: 1.05,
          }}
        >
          {name}
          {country && (
            <span
              style={{
                display: "block",
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontWeight: 400,
                fontSize: "calc(10.5px * var(--font-scale))",
                letterSpacing: "0.06em",
                color: "var(--fg-3)",
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              {country}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
