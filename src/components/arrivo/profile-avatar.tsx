"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { getAvatarTint } from "@/lib/trip-tints";
import { cn } from "@/lib/utils";

interface ProfileAvatarProps {
  /** Stored photo URL; initials show when absent or when the photo fails to load. */
  image?: string | null;
  initials: string;
  /** Diameter in px. */
  size: number;
  /** Fallback colors; defaults to the tint derived from the initials. */
  tint?: { bg: string; color: string };
  /** CSS font-size for the initials; defaults to 40% of `size`. */
  fontSize?: string;
  className?: string;
  style?: CSSProperties;
}

export function ProfileAvatar({ image, initials, size, tint, fontSize, className, style }: ProfileAvatarProps) {
  // Remember which URL failed, so a newly uploaded photo gets a fresh attempt.
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const showImage = !!image && image !== failedImage;
  const colors = tint ?? getAvatarTint(initials);

  return (
    <div
      data-slot="profile-avatar"
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold", className)}
      style={{
        width: size,
        height: size,
        background: colors.bg,
        color: colors.color,
        fontFamily: "var(--font-body, ui-sans-serif)",
        fontSize: fontSize ?? `${Math.round(size * 0.4)}px`,
        lineHeight: 1,
        ...style,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a stored 256px WebP behind the auth-gated storage route; next/image adds nothing
        <img
          src={image}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          onError={() => setFailedImage(image)}
        />
      ) : (
        initials
      )}
    </div>
  );
}
