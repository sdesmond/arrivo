"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { updateProfile } from "./actions";
import type { UserProfile } from "@/data/types";

interface ProfileIdentitySectionProps {
  user: UserProfile;
}

function getInitials(user: UserProfile): string {
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return user.email[0].toUpperCase();
}

export function ProfileIdentitySection({ user }: ProfileIdentitySectionProps) {
  const [name, setName] = useState(user.name ?? "");
  const [isPending, startTransition] = useTransition();
  const initials = getInitials({ ...user, name: name || null });

  function handleSave() {
    startTransition(async () => {
      await updateProfile({ name });
    });
  }

  return (
    <Section title="Identity">
      <div className="flex items-center gap-4 mb-1">
        <div
          className="shrink-0 rounded-full flex items-center justify-center font-semibold"
          style={{
            width: 56,
            height: 56,
            background: "var(--surface-2)",
            color: "var(--fg)",
            fontFamily: "var(--font-body, ui-sans-serif)",
            fontSize: 20,
          }}
        >
          {initials}
        </div>
        <div style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.4 }}>Profile photo upload coming soon.</div>
      </div>

      <Field label="Name" htmlFor="profile-name">
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors"
          style={{
            background: "var(--surface-2)",
            color: "var(--fg)",
            border: "1px solid var(--line)",
          }}
          placeholder="Your name"
        />
      </Field>

      <Field label="Email" htmlFor="profile-email">
        <input
          id="profile-email"
          type="email"
          value={user.email}
          readOnly
          className="w-full rounded-[6px] px-2.5 py-1.5 text-[13px]"
          style={{
            background: "var(--surface)",
            color: "var(--fg-3)",
            border: "1px solid var(--line)",
            cursor: "default",
          }}
        />
      </Field>

      <div>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
