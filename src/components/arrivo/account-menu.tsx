"use client";

import { useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

export interface AccountMenuProps {
  isAdmin: boolean;
  trigger: ReactElement;
  side: "top" | "bottom";
}

export function AccountMenu({ isAdmin, trigger, side }: AccountMenuProps) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const navigationIdentity = `${pathname}?${search}`;
  const [authority, setAuthority] = useState({ navigationIdentity, isAdmin });

  useEffect(() => {
    let active = true;
    // App layouts survive client navigation; do not retain their original authority.
    // A read must not enter Next's server-action queue and race client navigation.
    void fetch("/api/users/me/app-role", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not check app role");
        const result: unknown = await response.json();
        if (active) {
          setAuthority({
            navigationIdentity,
            isAdmin: typeof result === "object" && result !== null && "isAdmin" in result && result.isAdmin === true,
          });
        }
      })
      .catch(() => {
        if (active) setAuthority({ navigationIdentity, isAdmin: false });
      });
    return () => {
      active = false;
    };
  }, [navigationIdentity]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent side={side} className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem className="min-h-11 cursor-pointer" render={<Link href="/profile" />}>
            Settings
          </DropdownMenuItem>
          {authority.navigationIdentity === navigationIdentity && authority.isAdmin && (
            <DropdownMenuItem className="min-h-11 cursor-pointer" render={<Link href="/admin" prefetch={false} />}>
              Manage app
            </DropdownMenuItem>
          )}
          <form action={signOutAction}>
            <DropdownMenuItem nativeButton className="min-h-11 w-full cursor-pointer" render={<button type="submit" />}>
              Log out
            </DropdownMenuItem>
          </form>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
