"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { updateProfile } from "./actions";
import type { UserProfile } from "@/data/types";
import { normalizeUsername, validateUsername } from "@/lib/username";

interface ProfileIdentitySectionProps {
  user: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
}

function getInitials(user: UserProfile): string {
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return user.username[0].toUpperCase();
}

export function ProfileIdentitySection({ user, onDirtyChange }: ProfileIdentitySectionProps) {
  const [name, setName] = useState(user.name ?? "");
  const [username, setUsername] = useState(user.username);
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const initials = getInitials({ ...user, name: name || null });

  const isNameDirty = name !== (user.name ?? "");
  const isUsernameDirty = normalizeUsername(username) !== user.username;

  function handleNameChange(next: string) {
    if (next === name) return;
    setName(next);
    onDirtyChange?.(next !== (user.name ?? "") || isUsernameDirty);
  }

  function handleUsernameChange(next: string) {
    if (next === username) return;
    setUsername(next);
    onDirtyChange?.(isNameDirty || normalizeUsername(next) !== user.username);
  }

  const nameError = name.length > 100 ? "Name must be 100 characters or fewer." : null;
  const usernameError = validateUsername(username);

  function handleSave() {
    startTransition(async () => {
      const result = await updateProfile({ name, ...(isUsernameDirty ? { username } : {}) });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setJustSaved(true);
      onDirtyChange?.(false);
      setTimeout(() => setJustSaved(false), 2000);
    });
  }

  const isDirty = isNameDirty || isUsernameDirty;

  return (
    <Section>
      <div className="flex items-center gap-4 mb-1">
        <div
          className="shrink-0 rounded-full flex items-center justify-center font-semibold"
          style={{
            width: 56,
            height: 56,
            background: "var(--surface-2)",
            color: "var(--fg)",
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontSize: "calc(20px * var(--font-scale))",
          }}
        >
          {initials}
        </div>
        <div style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)", lineHeight: 1.4 }}>
          Profile photo upload coming soon.
        </div>
      </div>

      <Field label="Name" htmlFor="profile-name" error={nameError ?? undefined}>
        <Input
          id="profile-name"
          type="text"
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          placeholder="Your name"
          aria-invalid={!!nameError || undefined}
          aria-describedby={nameError ? "profile-name-error" : undefined}
        />
      </Field>

      <Field label="Username" htmlFor="profile-username" error={usernameError ?? undefined}>
        <Input
          id="profile-username"
          type="text"
          value={username}
          onChange={(event) => handleUsernameChange(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={!!usernameError || undefined}
          aria-describedby={usernameError ? "profile-username-error" : undefined}
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span role="status" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--accent-brand)" }}>
            Saved
          </span>
        )}
        <Button size="sm" onClick={handleSave} disabled={isPending || !isDirty || !!nameError || !!usernameError}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
