"use client";

import { ProfileAvatar } from "@/components/arrivo/profile-avatar";
import { cn } from "@/lib/utils";

interface AvatarStackProps {
  initials: string[];
  /** Profile photo URL per member, parallel to `initials`; a missing or null entry shows initials. */
  images?: (string | null | undefined)[];
  size?: "sm" | "md";
  max?: number;
  className?: string;
  "aria-label"?: string;
}

export function AvatarStack({
  initials,
  images,
  size = "sm",
  max = 4,
  className,
  "aria-label": ariaLabel,
}: AvatarStackProps) {
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
      {visible.map((initial, index) => (
        <ProfileAvatar
          key={`${initial}-${index}`}
          image={images?.[index]}
          initials={initial}
          size={dim}
          fontSize={fontSize}
          style={{
            border: "2px solid var(--bg)",
            marginLeft: index === 0 ? 0 : -(dim * 0.25),
          }}
        />
      ))}
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
