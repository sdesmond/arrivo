"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserRole, type InstanceUserSummary } from "@/data/types";
import { ChangeRoleDialog } from "./change-role-dialog";

interface InstanceUsersListProps {
  users: InstanceUserSummary[];
  currentUserId: string;
}

export function InstanceUsersList({ users, currentUserId }: InstanceUsersListProps) {
  const router = useRouter();
  const [tooltipUserId, setTooltipUserId] = useState<string | null>(null);
  return (
    <ul aria-label="Instance users" className="mt-4 flex flex-col gap-3">
      {users.map((user) => {
        const action = user.role === UserRole.Admin ? "Remove admin" : "Make admin";
        const button = (
          <Button
            className="h-11"
            variant="outline"
            aria-label={`${action}: ${user.username}`}
            disabled={user.isLastCompletedAdmin}
          >
            {action}
          </Button>
        );
        return (
          <li
            key={user.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            style={{ borderColor: "var(--line)" }}
          >
            <div className="min-w-0">
              <p className="font-medium break-all" style={{ color: "var(--fg)" }}>
                {user.username}
              </p>
              <p className="text-sm" style={{ color: "var(--fg-2)" }}>
                {user.role === UserRole.Admin ? "Admin" : "Member"} ·{" "}
                {user.setupComplete ? "Setup complete" : "Setup pending"}
              </p>
            </div>
            {user.isLastCompletedAdmin ? (
              <Tooltip
                open={tooltipUserId === user.id}
                onOpenChange={(open) => setTooltipUserId(open ? user.id : null)}
              >
                <TooltipTrigger
                  closeOnClick={false}
                  onClick={() => setTooltipUserId(user.id)}
                  render={<span tabIndex={0} className="inline-flex" />}
                  aria-label={`Remove admin unavailable: ${user.username}`}
                  aria-describedby={`admin-disabled-${user.id}`}
                >
                  {button}
                </TooltipTrigger>
                <TooltipContent id={`admin-disabled-${user.id}`} role="tooltip">
                  Make another user an admin first.
                </TooltipContent>
              </Tooltip>
            ) : (
              (user.setupComplete || user.role === UserRole.Admin) && (
                <ChangeRoleDialog
                  user={user}
                  onSuccess={(role) => {
                    toast.success("Role updated.");
                    if (user.id === currentUserId && role === UserRole.Member) router.push("/profile");
                    else router.refresh();
                  }}
                >
                  {button}
                </ChangeRoleDialog>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
