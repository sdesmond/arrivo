"use client";

import { useRef, useState } from "react";
import {
  PASSWORD_POLICY_BOUNDS,
  type PasswordPolicy,
  type PasswordPolicyField,
  type PasswordPolicyReadResult,
} from "@/data/types";
import { refreshPasswordPolicy, savePasswordPolicySettings } from "@/app/(app)/admin/security/actions";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PasswordPolicySettingsProps {
  initial: PasswordPolicyReadResult;
}

type CountField = keyof PasswordPolicy;

/** What the admin is typing: counts stay text so a blank or fractional entry is reported, never silently fixed. */
type Draft = Record<CountField, string>;

const CLASS_ROWS: { count: CountField; label: string }[] = [
  { count: "minUppercase", label: "Minimum uppercase letters" },
  { count: "minNumbers", label: "Minimum numbers" },
  { count: "minSpecial", label: "Minimum special characters" },
];

function toDraft(policy: PasswordPolicy): Draft {
  return {
    minLength: String(policy.minLength),
    maxLength: String(policy.maxLength),
    minUppercase: String(policy.minUppercase),
    minNumbers: String(policy.minNumbers),
    minSpecial: String(policy.minSpecial),
  };
}

function parseCount(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

function fromDraft(draft: Draft): Record<string, unknown> {
  return Object.fromEntries(Object.entries(draft).map(([field, text]) => [field, parseCount(text)]));
}

const STALE_MESSAGE = "Password rules changed elsewhere. Review the updated values shown here, then save again.";
const FIELD_STYLE = { fontFamily: "var(--font-body, ui-sans-serif)" };

export function PasswordPolicySettings({ initial }: PasswordPolicySettingsProps) {
  const initialPolicy = initial.status === "ok" ? initial.policy : null;
  const [saved, setSaved] = useState<PasswordPolicy | null>(initialPolicy);
  const [draft, setDraft] = useState<Draft | null>(initialPolicy ? toDraft(initialPolicy) : null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<PasswordPolicyField | null>(null);
  const fieldRefs = useRef<Partial<Record<PasswordPolicyField, HTMLInputElement | null>>>({});

  function fail(text: string, field?: PasswordPolicyField) {
    setError(text);
    setInvalidField(field ?? null);
    if (field) setTimeout(() => fieldRefs.current[field]?.focus(), 0);
  }

  async function refresh(): Promise<boolean> {
    try {
      const result = await refreshPasswordPolicy();
      if (result.status !== "ok") return false;
      setSaved(result.policy);
      setDraft(toDraft(result.policy));
      return true;
    } catch {
      return false;
    }
  }

  async function save() {
    if (!saved || !draft) return;
    setError("");
    setMessage("");
    setInvalidField(null);
    const candidate = fromDraft(draft);
    // The same validator the server runs: an impossible combination is explained here, before any request.
    const checked = validatePasswordPolicy(candidate);
    if (!checked.ok) {
      fail(checked.error, checked.field);
      return;
    }
    setPending(true);
    try {
      const result = await savePasswordPolicySettings(checked.policy, saved);
      if (result.status === "ok") {
        setSaved(result.policy);
        setDraft(toDraft(result.policy));
        setMessage("Password rules saved.");
      } else if (result.status === "invalid") {
        fail(result.error, result.field);
      } else if (result.status === "stale") {
        // A stale save never goes through on its own: show what is saved now and require another deliberate save.
        const refreshed = await refresh();
        fail(refreshed ? STALE_MESSAGE : "Password rules changed elsewhere. Reload this page, then try again.");
      } else if (result.status === "forbidden") {
        fail("Admin access is required to save password rules.");
      } else {
        fail("Could not save password rules. The saved rules are unchanged. Try again.");
      }
    } catch {
      fail("Could not save password rules. The saved rules are unchanged. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!saved || !draft) {
    return (
      <section aria-labelledby="password-policy-heading" className="my-4 grid gap-3" style={FIELD_STYLE}>
        <h3 id="password-policy-heading" className="font-semibold">
          Password rules
        </h3>
        <p className="text-sm">Saved password rules unavailable.</p>
        <Button
          variant="outline"
          className="h-11 w-fit"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void refresh().finally(() => setPending(false));
          }}
        >
          Retry
        </Button>
      </section>
    );
  }

  const countInput = (field: CountField, label: string) => {
    const bounds =
      field === "minLength"
        ? PASSWORD_POLICY_BOUNDS.minLength
        : field === "maxLength"
          ? PASSWORD_POLICY_BOUNDS.maxLength
          : PASSWORD_POLICY_BOUNDS.classMinimum;
    const invalid = invalidField === field;
    const isClassMinimum = field !== "minLength" && field !== "maxLength";
    return (
      <div className="grid gap-1">
        <label htmlFor={`password-policy-${field}`}>{label}</label>
        <Input
          id={`password-policy-${field}`}
          ref={(element) => {
            fieldRefs.current[field] = element;
          }}
          type="number"
          inputMode="numeric"
          step={1}
          min={bounds.min}
          max={bounds.max}
          className="h-11 w-32"
          value={draft[field]}
          disabled={pending}
          aria-invalid={invalid || undefined}
          aria-describedby={
            invalid ? "password-policy-error" : isClassMinimum ? undefined : `password-policy-${field}-hint`
          }
          onChange={(event) => setDraft((current) => current && { ...current, [field]: event.target.value })}
        />
        {!isClassMinimum && (
          <span id={`password-policy-${field}-hint`} className="text-sm" style={{ color: "var(--fg-3)" }}>
            {bounds.min} to {bounds.max}
          </span>
        )}
      </div>
    );
  };

  return (
    <section aria-labelledby="password-policy-heading" className="my-4 grid gap-4" style={FIELD_STYLE}>
      <h3 id="password-policy-heading" className="font-semibold">
        Password rules
      </h3>
      <p className="text-sm">
        These rules apply when someone chooses a new password. Signing in is never affected, and lowercase letters and
        spaces are always allowed.
      </p>
      <div className="flex flex-wrap gap-4">
        {countInput("minLength", "Minimum length")}
        {countInput("maxLength", "Maximum length")}
      </div>
      <div className="flex flex-wrap gap-4">
        {CLASS_ROWS.map((row) => (
          <div key={row.count}>{countInput(row.count, row.label)}</div>
        ))}
      </div>
      {error && (
        <p id="password-policy-error" role="alert" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <Button className="h-11 w-fit" disabled={pending} onClick={() => void save()}>
        {pending ? "Saving…" : "Save password rules"}
      </Button>
    </section>
  );
}
