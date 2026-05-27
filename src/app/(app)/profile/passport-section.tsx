"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { updateProfile } from "./actions";
import type { UserProfile } from "@/data/types";

interface PassportSectionProps {
  user: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
}

export function PassportSection({ user, onDirtyChange }: PassportSectionProps) {
  const [passportNumber, setPassportNumber] = useState(user.passportNumber ?? "");
  const [passportExpiry, setPassportExpiry] = useState<string | undefined>(user.passportExpiry ?? undefined);
  const [passportNationality, setPassportNationality] = useState(user.passportNationality ?? "");
  const [knownTravelerNumber, setKnownTravelerNumber] = useState(user.knownTravelerNumber ?? "");
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  function computeDirty(
    passportNumber: string,
    passportExpiry: string | undefined,
    passportNationality: string,
    knownTravelerNumber: string
  ) {
    return (
      passportNumber !== (user.passportNumber ?? "") ||
      passportExpiry !== (user.passportExpiry ?? undefined) ||
      passportNationality !== (user.passportNationality ?? "") ||
      knownTravelerNumber !== (user.knownTravelerNumber ?? "")
    );
  }

  const passportNumberError = passportNumber.length > 20 ? "Passport number must be 20 characters or fewer." : null;
  const nationalityError = passportNationality.length > 50 ? "Nationality must be 50 characters or fewer." : null;
  const ktnError = knownTravelerNumber.length > 20 ? "Known traveler number must be 20 characters or fewer." : null;
  const hasError = !!(passportNumberError || nationalityError || ktnError);

  function handleSave() {
    startTransition(async () => {
      const result = await updateProfile({
        passportNumber: passportNumber || null,
        passportExpiry: passportExpiry,
        passportNationality: passportNationality || null,
        knownTravelerNumber: knownTravelerNumber || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setJustSaved(true);
      onDirtyChange?.(false);
      setTimeout(() => setJustSaved(false), 2000);
    });
  }

  const isDirty = computeDirty(passportNumber, passportExpiry, passportNationality, knownTravelerNumber);

  return (
    <Section title="Passport & Travel Documents">
      <Field label="Passport number" htmlFor="passport-number" error={passportNumberError ?? undefined}>
        <Input
          id="passport-number"
          type="text"
          value={passportNumber}
          onChange={(e) => {
            setPassportNumber(e.target.value);
            onDirtyChange?.(computeDirty(e.target.value, passportExpiry, passportNationality, knownTravelerNumber));
          }}
          placeholder="e.g. A12345678"
          autoComplete="off"
          aria-invalid={!!passportNumberError || undefined}
          aria-describedby={passportNumberError ? "passport-number-error" : undefined}
        />
      </Field>

      <Field label="Expiry date">
        <DatePicker
          value={passportExpiry}
          onChange={(v) => {
            setPassportExpiry(v);
            onDirtyChange?.(computeDirty(passportNumber, v, passportNationality, knownTravelerNumber));
          }}
          placeholder="Expiry date"
        />
      </Field>

      <Field label="Nationality" htmlFor="passport-nationality" error={nationalityError ?? undefined}>
        <Input
          id="passport-nationality"
          type="text"
          value={passportNationality}
          onChange={(e) => {
            setPassportNationality(e.target.value);
            onDirtyChange?.(computeDirty(passportNumber, passportExpiry, e.target.value, knownTravelerNumber));
          }}
          placeholder="e.g. American"
          aria-invalid={!!nationalityError || undefined}
          aria-describedby={nationalityError ? "passport-nationality-error" : undefined}
        />
      </Field>

      <Field label="Known traveler number (TSA PreCheck / Global Entry)" htmlFor="ktn" error={ktnError ?? undefined}>
        <Input
          id="ktn"
          type="text"
          value={knownTravelerNumber}
          onChange={(e) => {
            setKnownTravelerNumber(e.target.value);
            onDirtyChange?.(computeDirty(passportNumber, passportExpiry, passportNationality, e.target.value));
          }}
          placeholder="e.g. 123456789"
          autoComplete="off"
          aria-invalid={!!ktnError || undefined}
          aria-describedby={ktnError ? "ktn-error" : undefined}
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span role="status" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--accent-brand)" }}>
            Saved
          </span>
        )}
        <Button size="sm" onClick={handleSave} disabled={isPending || !isDirty || hasError}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
