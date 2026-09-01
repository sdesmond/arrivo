"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { IconSize } from "@/lib/size-tokens";

export interface NavItemProps {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  href: string;
  count?: number;
  countTint?: "warning";
  active?: boolean;
}

export function NavItem({ icon: Icon, label, href, count, countTint, active }: NavItemProps) {
  const hasCount = count != null && count > 0;
  const ariaLabel = hasCount ? `${label}, ${count} pending invitations` : undefined;

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-[6px] font-medium transition-colors",
        "hover:bg-surface",
        active ? "bg-surface-2 text-fg" : "text-fg-2"
      )}
      style={{ fontSize: "calc(var(--fs-nav) * var(--font-scale))" }}
    >
      <Icon
        size={IconSize.navItem}
        strokeWidth={1.5}
        className={cn("shrink-0", active ? "text-accent-brand" : "text-fg-3")}
      />
      <span>{label}</span>
      {hasCount && (
        <span
          className="ml-auto"
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "calc(var(--fs-nav-badge) * var(--font-scale))",
            fontWeight: 500,
            letterSpacing: "0.04em",
            color: countTint === "warning" ? "var(--warning)" : "var(--fg-3)",
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
