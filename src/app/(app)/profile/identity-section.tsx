"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { updateProfile } from "./actions";
import type { UserProfile } from "@/data/types";

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
  return user.email[0].toUpperCase();
}

export function ProfileIdentitySection({ user, onDirtyChange }: ProfileIdentitySectionProps) {
  const [name, setName] = useState(user.name ?? "");
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);
  const initials = getInitials({ ...user, name: name || null });

  function handleNameChange(next: string) {
    setName(next);
    const dirty = next !== (user.name ?? "");
    onDirtyChange?.(dirty);
  }

  const nameError = name.length > 100 ? "Name must be 100 characters or fewer." : null;

  function handleSave() {
    startTransition(async () => {
      const result = await updateProfile({ name });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setJustSaved(true);
      onDirtyChange?.(false);
      setTimeout(() => setJustSaved(false), 2000);
    });
  }

  const isDirty = name !== (user.name ?? "");

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

      <Field label="Email" htmlFor="profile-email">
        <input
          id="profile-email"
          type="email"
          value={user.email}
          readOnly
          className="w-full rounded-[6px] px-2.5 py-1.5"
          style={{
            background: "var(--surface)",
            color: "var(--fg-3)",
            border: "1px solid var(--line)",
            cursor: "default",
            fontSize: "calc(13px * var(--font-scale))",
          }}
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span role="status" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--accent-brand)" }}>
            Saved
          </span>
        )}
        <Button size="sm" onClick={handleSave} disabled={isPending || !isDirty || !!nameError}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
