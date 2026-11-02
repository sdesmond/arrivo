"use client";

import Image from "next/image";
import arrivoLogo from "@/assets/arrivo-logo.svg";
import arrivoText from "@/assets/arrivo-text.svg";
import { cn } from "@/lib/utils";

export interface ArrivoBrandProps {
  /** Logo height in px; the wordmark scales with it. */
  size?: number;
  className?: string;
}

export function ArrivoBrand({ size = 24, className }: ArrivoBrandProps) {
  const wordmarkHeight = Math.round((size * 2) / 3);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        src={arrivoLogo}
        alt=""
        aria-hidden="true"
        width={Math.round(size * (411.23917 / 443.29297))}
        height={size}
        priority
      />
      <Image
        src={arrivoText}
        alt="Arrivo"
        width={Math.round(wordmarkHeight * (1225.2265 / 356.03836))}
        height={wordmarkHeight}
        style={{
          height: `calc(${wordmarkHeight}px * var(--font-scale))`,
          width: "auto",
        }}
        priority
      />
    </span>
  );
}
