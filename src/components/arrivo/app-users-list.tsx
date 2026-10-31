"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useNow } from "@/components/providers/mock-date-provider";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

// Completed accounts are the normal case and say nothing; only unusual states get a status line.
function SetupStatus({ user, now }: SetupStatusProps) {
  if (user.setupComplete) return null;
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

const ROLE_ITEMS = [
  { value: UserRole.Member, label: "Member" },
  { value: UserRole.Admin, label: "Admin" },
];

interface RoleControlProps {
  user: AppUserSummary;
  onSuccess: (role: UserRole) => void;
  disabled?: boolean;
}

// The select always shows the persisted role; picking the other one only opens the confirmation, so cancelling or
// failing leaves the control where it was.
function RoleControl({ user, onSuccess, disabled }: RoleControlProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <span aria-hidden="true" className="text-xs font-medium" style={{ color: "var(--fg-2)" }}>
          Role
        </span>
        <Select
          items={ROLE_ITEMS}
          value={user.role}
          disabled={disabled}
          onValueChange={(role) => {
            if (role !== user.role) setConfirmOpen(true);
          }}
        >
          <SelectTrigger
            ref={triggerRef}
            aria-label={`Role: ${user.username}`}
            className="h-11 min-w-32 data-[size=default]:h-11"
            style={{ color: "var(--fg)" }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value} className="py-1.5 pl-2">
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ChangeRoleDialog
        user={user}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        getFocusTargetOnClose={() => triggerRef.current}
        onSuccess={onSuccess}
      />
    </>
  );
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
        const statusLine = !user.setupComplete;
        return (
          <li
            key={user.id}
            className="relative flex min-w-0 flex-col items-start gap-3 rounded-lg border p-4"
            style={{ borderColor: "var(--line)", background: "var(--bg)" }}
          >
            <div className="min-w-0 pr-12">
              <p className="text-lg font-bold break-all" style={{ color: "var(--fg)" }}>
                {user.username}
              </p>
              {user.name && (
                <p className="text-sm break-words" style={{ color: "var(--fg-2)" }}>
                  {user.name}
                </p>
              )}
              {statusLine && (
                <p className="text-sm" style={{ color: "var(--fg-2)" }}>
                  <SetupStatus user={user} now={now} />
                </p>
              )}
            </div>
            <div className="absolute right-1 top-1">
              {user.isLastCompletedAdmin ? (
                <LastAdminTooltip
                  id={`${user.id}-delete`}
                  label={`Delete account unavailable: ${user.username}`}
                  openId={tooltipId}
                  onOpenIdChange={setTooltipId}
                >
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    title="Delete account"
                    aria-label={`Delete account: ${user.username}`}
                    style={{ color: "var(--fg-2)" }}
                    disabled
                  >
                    <Trash2 strokeWidth={1.5} aria-hidden="true" />
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
            </div>
            {user.isLastCompletedAdmin ? (
              <LastAdminTooltip
                id={`${user.id}-role`}
                label={`Role unavailable: ${user.username}`}
                openId={tooltipId}
                onOpenIdChange={setTooltipId}
              >
                <RoleControl user={user} disabled onSuccess={() => {}} />
              </LastAdminTooltip>
            ) : (
              (user.setupComplete || user.role === UserRole.Admin) && (
                <RoleControl
                  user={user}
                  onSuccess={(role) => {
                    toast.success("Role updated.");
                    if (user.id === currentUserId && role === UserRole.Member) router.push("/profile");
                    else router.refresh();
                  }}
                />
              )
            )}
            {!user.setupComplete && <RegenerateSetupLinkDialog userId={user.id} username={user.username} />}
            {user.setupComplete && user.id !== currentUserId && (
              <ResetPasswordDialog userId={user.id} username={user.username} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
