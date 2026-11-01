"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AdminSectionNavProps {
  children?: React.ReactNode;
}

const SECTIONS = [
  { href: "/admin/overview", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/activity", label: "Activity" },
];

export function AdminSectionNav({ children }: AdminSectionNavProps) {
  const pathname = usePathname();
  return (
    <div className="flex w-full flex-col sm:flex-row sm:items-start sm:gap-8">
      <nav aria-label="App sections" className="flex sm:w-40 sm:shrink-0 sm:flex-col">
        {SECTIONS.map(({ href, label }) => {
          const current = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              prefetch={false}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-md px-3 text-sm text-fg sm:w-full",
                current ? "bg-surface-2 font-medium" : "hover:bg-surface-2"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 min-w-0 flex-1 sm:mt-0">{children}</div>
    </div>
  );
}
