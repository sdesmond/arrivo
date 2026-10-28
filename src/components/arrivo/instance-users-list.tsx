"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useNow } from "@/components/providers/mock-date-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserRole, type InstanceUserSummary } from "@/data/types";
import { ChangeRoleDialog } from "./change-role-dialog";
import { DeleteUnfinishedAccountDialog } from "./delete-unfinished-account-dialog";
import { RegenerateSetupLinkDialog } from "./regenerate-setup-link-dialog";

interface InstanceUsersListProps {
  users: InstanceUserSummary[];
  currentUserId: string;
}

interface SetupStatusProps {
  user: InstanceUserSummary;
  now: Date;
}

function SetupStatus({ user, now }: SetupStatusProps) {
  if (user.setupComplete) return <>Setup complete</>;
  if (!user.setupExpiresAt) return <>Pending setup</>;
  const expiresAt = new Date(user.setupExpiresAt);
  if (expiresAt.getTime() <= now.getTime()) return <>Setup expired</>;
  return (
    <>
      Pending setup · Expires{" "}
      <time dateTime={user.setupExpiresAt} suppressHydrationWarning>
        {expiresAt.toLocaleString()}
      </time>
    </>
  );
}

export function InstanceUsersList({ users, currentUserId }: InstanceUsersListProps) {
  const router = useRouter();
  const now = useNow();
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
                {user.role === UserRole.Admin ? "Admin" : "Member"} · <SetupStatus user={user} now={now} />
              </p>
            </div>
            {!user.setupComplete && (
              <>
                <RegenerateSetupLinkDialog userId={user.id} username={user.username} />
                <DeleteUnfinishedAccountDialog userId={user.id} username={user.username} />
              </>
            )}
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
