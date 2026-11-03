"use client";

import { useState, useRef } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountDeletionTrip, PasswordPolicy, UserProfile } from "@/data/types";
import { ChangePasswordDialog } from "./change-password-dialog";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { ProfileIdentitySection } from "./identity-section";

interface ProfileAccountSectionProps {
  user: UserProfile;
  sharedOwnedTrips?: AccountDeletionTrip[];
  /** Rules from the server page; undefined when they could not be read. */
  passwordPolicy?: PasswordPolicy;
  /** Dirty means unsaved name, username or photo changes. Password input lives in a dialog and never counts. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** One Account section: who you are (name, username, photo), your password, then deleting the account. */
export function ProfileAccountSection({
  user,
  sharedOwnedTrips = [],
  passwordPolicy,
  onDirtyChange,
}: ProfileAccountSectionProps) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const passwordTriggerRef = useRef<HTMLButtonElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <div className="flex flex-col gap-6">
        <h2
          style={{
            fontFamily: "var(--font-heading-family, ui-sans-serif)",
            fontSize: "calc(18px * var(--font-scale))",
            fontWeight: 700,
            color: "var(--fg)",
          }}
        >
          Account
        </h2>

        <ProfileIdentitySection user={user} onDirtyChange={onDirtyChange} />

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
          <Button
            ref={passwordTriggerRef}
            type="button"
            variant="outline"
            className="h-11 gap-2"
            onClick={() => setPasswordOpen(true)}
          >
            <KeyRound size={14} strokeWidth={1.5} />
            Change password
          </Button>
        </div>

        <div className="flex justify-end" style={{ borderTop: "1px solid var(--line)", paddingTop: 24, marginTop: 16 }}>
          <button
            ref={deleteTriggerRef}
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="flex min-h-11 min-w-11 items-center gap-2 rounded-[6px] px-3 py-1.5 font-medium transition-colors"
            style={{
              color: "var(--destructive)",
              background: "transparent",
              fontSize: "calc(13px * var(--font-scale))",
            }}
            onMouseEnter={(event) =>
              (event.currentTarget.style.background = "color-mix(in srgb, var(--destructive) 10%, transparent)")
            }
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
          >
            <Trash2 size={14} strokeWidth={1.5} />
            Delete account
          </button>
        </div>
      </div>

      <ChangePasswordDialog
        open={passwordOpen}
        passwordPolicy={passwordPolicy}
        onOpenChange={(open) => {
          setPasswordOpen(open);
          if (!open) passwordTriggerRef.current?.focus();
        }}
      />

      <DeleteAccountDialog
        open={deleteOpen}
        sharedTrips={sharedOwnedTrips}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) deleteTriggerRef.current?.focus();
        }}
      />
    </>
  );
}
