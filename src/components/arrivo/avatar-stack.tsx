"use client";

import { getAvatarTint } from "@/lib/trip-tints";
import { cn } from "@/lib/utils";

interface AvatarStackProps {
  initials: string[];
  size?: "sm" | "md";
  max?: number;
  className?: string;
  "aria-label"?: string;
}

export function AvatarStack({ initials, size = "sm", max = 4, className, "aria-label": ariaLabel }: AvatarStackProps) {
  const visible = initials.slice(0, max);
  const overflow = initials.length - visible.length;

  const dim = size === "sm" ? 22 : 28;
  const fontSize = size === "sm" ? "10.5px" : "12px";

  return (
    <div
      className={cn("flex items-center", className)}
      style={{ gap: 0 }}
      aria-label={ariaLabel ?? initials.join(", ")}
    >
      {visible.map((initial, i) => {
        const tint = getAvatarTint(initial);
        return (
          <div
            key={`${initial}-${i}`}
            style={{
              width: dim,
              height: dim,
              borderRadius: "50%",
              background: tint.bg,
              color: tint.color,
              fontSize,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--bg)",
              marginLeft: i === 0 ? 0 : -(dim * 0.25),
              flexShrink: 0,
              fontFamily: "var(--font-body, ui-sans-serif)",
              lineHeight: 1,
            }}
          >
            {initial}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          style={{
            width: dim,
            height: dim,
            borderRadius: "50%",
            background: "var(--surface-3)",
            color: "var(--fg-3)",
            fontSize,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--bg)",
            marginLeft: -(dim * 0.25),
            flexShrink: 0,
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
