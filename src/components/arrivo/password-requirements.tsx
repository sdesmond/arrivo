"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { PasswordPolicy } from "@/data/types";
import { evaluatePasswordRequirements, type PasswordRequirement } from "@/lib/password-policy";

export interface PasswordRequirementsProps {
  /** Id of the list; the password field points `aria-describedby` at it. */
  id: string;
  password: string;
  policy: PasswordPolicy;
}

interface Announcement {
  met: Record<string, boolean>;
  message: string;
}

function metById(requirements: PasswordRequirement[]): Record<string, boolean> {
  return Object.fromEntries(requirements.map((requirement) => [requirement.id, requirement.met]));
}

/** Describes only the requirements whose state flipped, so a keystroke that changes nothing says nothing. */
function describeChanges(previous: Record<string, boolean>, requirements: PasswordRequirement[]): string {
  return requirements
    .filter((requirement) => requirement.id in previous && previous[requirement.id] !== requirement.met)
    .map((requirement) => `${requirement.met ? "Met" : "No longer met"}: ${requirement.label}`)
    .join(". ");
}

/**
 * Live checklist for a new-password field. Evaluates locally on every edit with the same evaluator the server uses,
 * so it never makes a request. A satisfied requirement gets a checkmark; anything else keeps a blank marker, and
 * there is deliberately no failure mark: it is guidance, not a verdict.
 */
export function PasswordRequirements({ id, password, policy }: PasswordRequirementsProps) {
  const requirements = evaluatePasswordRequirements(password, policy);
  const [announcement, setAnnouncement] = useState<Announcement>(() => ({
    met: metById(requirements),
    message: "",
  }));

  // Derive the announcement while rendering (the documented alternative to an effect that sets state).
  const current = metById(requirements);
  if (JSON.stringify(current) !== JSON.stringify(announcement.met)) {
    setAnnouncement({ met: current, message: describeChanges(announcement.met, requirements) });
  }

  return (
    <div className="flex flex-col gap-1" style={{ fontFamily: "var(--font-body, ui-sans-serif)" }}>
      <p id={`${id}-title`} className="text-sm" style={{ color: "var(--fg-2)" }}>
        Password requirements
      </p>
      <ul id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-1">
        {requirements.map((requirement) => (
          <li key={requirement.id} className="flex items-center gap-2 text-sm" style={{ color: "var(--fg-2)" }}>
            <span
              aria-hidden="true"
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border"
              style={{ borderColor: requirement.met ? "var(--accent-brand)" : "var(--line)" }}
            >
              {requirement.met && <Check size={12} strokeWidth={1.5} style={{ color: "var(--accent-brand)" }} />}
            </span>
            <span>{requirement.label}</span>
            <span className="sr-only">{requirement.met ? " (met)" : " (not met)"}</span>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement.message}
      </p>
    </div>
  );
}
