"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
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

  function computeDirty(pn: string, pe: string | undefined, pnat: string, ktn: string) {
    return (
      pn !== (user.passportNumber ?? "") ||
      pe !== (user.passportExpiry ?? undefined) ||
      pnat !== (user.passportNationality ?? "") ||
      ktn !== (user.knownTravelerNumber ?? "")
    );
  }

  function handleSave() {
    startTransition(async () => {
      await updateProfile({
        passportNumber: passportNumber || undefined,
        passportExpiry: passportExpiry,
        passportNationality: passportNationality || undefined,
        knownTravelerNumber: knownTravelerNumber || undefined,
      });
      setJustSaved(true);
      onDirtyChange?.(false);
      setTimeout(() => setJustSaved(false), 2000);
    });
  }

  const isDirty = computeDirty(passportNumber, passportExpiry, passportNationality, knownTravelerNumber);

  return (
    <Section title="Passport & Travel Documents">
      <Field label="Passport number" htmlFor="passport-number">
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

      <Field label="Nationality" htmlFor="passport-nationality">
        <Input
          id="passport-nationality"
          type="text"
          value={passportNationality}
          onChange={(e) => {
            setPassportNationality(e.target.value);
            onDirtyChange?.(computeDirty(passportNumber, passportExpiry, e.target.value, knownTravelerNumber));
          }}
          placeholder="e.g. American"
        />
      </Field>

      <Field label="Known traveler number (TSA PreCheck / Global Entry)" htmlFor="ktn">
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
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span role="status" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--accent-brand)" }}>
            Saved
          </span>
        )}
        <Button size="sm" onClick={handleSave} disabled={isPending || !isDirty}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Section>
  );
}
