"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useNow } from "@/components/providers/mock-date-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserRole, type AppUserSummary } from "@/data/types";
import { ChangeRoleDialog } from "./change-role-dialog";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { RegenerateSetupLinkDialog } from "./regenerate-setup-link-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

interface AppUsersListProps {
  users: AppUserSummary[];
  currentUserId: string;
}

interface SetupStatusProps {
  user: AppUserSummary;
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

interface LastAdminTooltipProps {
  id: string;
  label: string;
  openId: string | null;
  onOpenIdChange: (id: string | null) => void;
  children: React.ReactElement;
}

// A disabled button swallows focus and touch, so the explanation hangs off a focusable wrapper instead.
function LastAdminTooltip({ id, label, openId, onOpenIdChange, children }: LastAdminTooltipProps) {
  return (
    <Tooltip open={openId === id} onOpenChange={(open) => onOpenIdChange(open ? id : null)}>
      <TooltipTrigger
        closeOnClick={false}
        onClick={() => onOpenIdChange(id)}
        render={<span tabIndex={0} className="inline-flex" />}
        aria-label={label}
        aria-describedby={`admin-disabled-${id}`}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent id={`admin-disabled-${id}`} role="tooltip">
        Make another user an admin first.
      </TooltipContent>
    </Tooltip>
  );
}

export function AppUsersList({ users, currentUserId }: AppUsersListProps) {
  const router = useRouter();
  const now = useNow();
  const [tooltipId, setTooltipId] = useState<string | null>(null);
  // A deleted row takes its Delete button with it, so focus lands on the list rather than on the page body.
  const listRef = useRef<HTMLUListElement>(null);
  return (
    <ul
      ref={listRef}
      tabIndex={-1}
      aria-label="App users"
      className="mt-4 grid grid-cols-1 gap-3 outline-none sm:grid-cols-2 xl:grid-cols-3"
    >
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
            className="flex flex-col items-start gap-3 rounded-lg border p-3"
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
            {!user.setupComplete && <RegenerateSetupLinkDialog userId={user.id} username={user.username} />}
            {user.setupComplete && user.id !== currentUserId && (
              <ResetPasswordDialog userId={user.id} username={user.username} />
            )}
            {user.isLastCompletedAdmin ? (
              <LastAdminTooltip
                id={`${user.id}-role`}
                label={`Remove admin unavailable: ${user.username}`}
                openId={tooltipId}
                onOpenIdChange={setTooltipId}
              >
                {button}
              </LastAdminTooltip>
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
            {user.isLastCompletedAdmin ? (
              <LastAdminTooltip
                id={`${user.id}-delete`}
                label={`Delete account unavailable: ${user.username}`}
                openId={tooltipId}
                onOpenIdChange={setTooltipId}
              >
                <Button variant="outline" className="h-11" aria-label={`Delete account: ${user.username}`} disabled>
                  Delete
                </Button>
              </LastAdminTooltip>
            ) : (
              <DeleteAccountDialog
                userId={user.id}
                username={user.username}
                setupComplete={user.setupComplete}
                isCurrentUser={user.id === currentUserId}
                getFocusTargetAfterDelete={() => listRef.current}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
