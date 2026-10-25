"use client";

import Link from "next/link";

export interface AdminSectionNavProps {
  children?: React.ReactNode;
}

export function AdminSectionNav({ children }: AdminSectionNavProps) {
  return (
    <div className="flex w-full flex-col sm:flex-row sm:items-start sm:gap-8">
      <nav aria-label="Instance sections" className="flex sm:w-40 sm:shrink-0 sm:flex-col">
        <Link
          href="/admin/users"
          prefetch={false}
          aria-current="page"
          className="flex min-h-11 items-center rounded-md bg-surface-2 px-3 text-sm font-medium text-fg sm:w-full"
        >
          Users
        </Link>
      </nav>
      <div className="mt-4 min-w-0 flex-1 sm:mt-0">{children}</div>
    </div>
  );
}
