"use client";

import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import * as LucideIcons from "lucide-react";
import { useTheme } from "next-themes";
import { getTint } from "@/lib/trip-tints";
import { cn, parseGraphicCover } from "@/lib/utils";

const graphicIconLookup = LucideIcons as unknown as Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>
>;

interface TripCoverProps {
  name: string;
  country?: string;
  metaTag?: string;
  showCity?: boolean;
  className?: string;
  style?: React.CSSProperties;
  coverImageUrl?: string;
  destinationCountry?: string;
}

function toGraphicIconKey(iconName: string): string {
  return iconName
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function renderGraphicIcon(iconName: string): ReactNode {
  const IconComponent = graphicIconLookup[toGraphicIconKey(iconName)];
  if (!IconComponent) return null;
  return <IconComponent size={128} strokeWidth={1.5} style={{ color: "white" }} />;
}

export function TripCover({
  name,
  country,
  metaTag,
  showCity = true,
  className,
  style,
  coverImageUrl,
  destinationCountry,
}: TripCoverProps) {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const normalizedCoverImageUrl = coverImageUrl?.trim() ?? "";
  const [failedCoverImageUrl, setFailedCoverImageUrl] = useState<string | null>(null);

  const dark = mounted && resolvedTheme === "dark";
  const tint = getTint(name, dark);
  const activeCoverImageUrl = failedCoverImageUrl === normalizedCoverImageUrl ? "" : normalizedCoverImageUrl;
  const graphicCover = parseGraphicCover(activeCoverImageUrl);
  const isImageUrl =
    activeCoverImageUrl.startsWith("http://") ||
    activeCoverImageUrl.startsWith("https://") ||
    activeCoverImageUrl.startsWith("/");
  const photoCoverImageUrl = activeCoverImageUrl && !graphicCover && isImageUrl ? activeCoverImageUrl : null;
  const overlayCountry = destinationCountry?.trim() || country;
  const graphicIconEl = graphicCover ? renderGraphicIcon(graphicCover.icon) : null;

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: graphicCover?.color ?? tint, ...style }}
    >
      {photoCoverImageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photoCoverImageUrl}
            src={photoCoverImageUrl}
            alt=""
            role="presentation"
            onError={() => {
              if (isMountedRef.current) setFailedCoverImageUrl(normalizedCoverImageUrl);
            }}
            onLoad={() => {
              if (isMountedRef.current) setFailedCoverImageUrl(null);
            }}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </>
      ) : !graphicCover ? (
        <div className="cover-stripes absolute inset-0" />
      ) : null}

      {graphicCover && graphicCover.pattern !== "none" ? (
        <div className={`cover-pattern-${graphicCover.pattern} absolute inset-0`} />
      ) : null}

      {graphicIconEl ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 1 }}>
          {graphicIconEl}
        </div>
      ) : null}

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
            color: photoCoverImageUrl ? "white" : "var(--fg)",
            textShadow: photoCoverImageUrl ? "0 1px 3px rgba(0,0,0,0.4)" : undefined,
            lineHeight: 1.05,
          }}
        >
          {name}
          {overlayCountry && (
            <span
              style={{
                display: "block",
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontWeight: 400,
                fontSize: "calc(10.5px * var(--font-scale))",
                letterSpacing: "0.06em",
                color: photoCoverImageUrl ? "rgba(255,255,255,0.8)" : "var(--fg-3)",
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              {overlayCountry}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
