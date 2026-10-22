"use client";

import Image from "next/image";
import arrivoLogo from "@/assets/arrivo-logo.svg";
import { cn } from "@/lib/utils";

export interface ArrivoBrandProps {
  /** Logo edge length in px; the wordmark scales with it. */
  size?: number;
  className?: string;
}

export function ArrivoBrand({ size = 24, className }: ArrivoBrandProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      style={{
        fontFamily: "var(--font-heading-family, ui-sans-serif)",
        fontWeight: 700,
        fontSize: `calc(${Math.round((size * 2) / 3)}px * var(--font-scale))`,
        letterSpacing: "-0.02em",
        color: "var(--fg)",
      }}
    >
      <Image src={arrivoLogo} alt="" aria-hidden="true" width={size} height={size} priority />
      Arrivo
    </span>
  );
}
