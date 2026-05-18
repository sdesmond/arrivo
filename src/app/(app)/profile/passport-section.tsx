"use client";

import { useState, useTransition } from "react";
import { Section, Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { updateProfile } from "./actions";
import type { UserProfile } from "@/data/types";

interface PassportSectionProps {
  user: UserProfile;
  onDirtyChange?: (dirty: boolean) => void;
}

const INPUT_CLASS = "w-full rounded-[6px] px-2.5 py-1.5 text-[13px] outline-none transition-colors";
const INPUT_STYLE: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--fg)",
  border: "1px solid var(--line)",
};

export function PassportSection({ user, onDirtyChange }: PassportSectionProps) {
  const [passportNumber, setPassportNumber] = useState(user.passportNumber ?? "");
  const [passportExpiry, setPassportExpiry] = useState(user.passportExpiry ?? "");
  const [passportNationality, setPassportNationality] = useState(user.passportNationality ?? "");
  const [knownTravelerNumber, setKnownTravelerNumber] = useState(user.knownTravelerNumber ?? "");
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  function computeDirty(pn: string, pe: string, pnat: string, ktn: string) {
    return (
      pn !== (user.passportNumber ?? "") ||
      pe !== (user.passportExpiry ?? "") ||
      pnat !== (user.passportNationality ?? "") ||
      ktn !== (user.knownTravelerNumber ?? "")
    );
  }

  function handleSave() {
    startTransition(async () => {
      await updateProfile({
        passportNumber: passportNumber || undefined,
        passportExpiry: passportExpiry || undefined,
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
        <input
          id="passport-number"
          type="text"
          value={passportNumber}
          onChange={(e) => {
            setPassportNumber(e.target.value);
            onDirtyChange?.(computeDirty(e.target.value, passportExpiry, passportNationality, knownTravelerNumber));
          }}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
          placeholder="e.g. A12345678"
          autoComplete="off"
        />
      </Field>

      <Field label="Expiry date" htmlFor="passport-expiry">
        <input
          id="passport-expiry"
          type="date"
          value={passportExpiry}
          onChange={(e) => {
            setPassportExpiry(e.target.value);
            onDirtyChange?.(computeDirty(passportNumber, e.target.value, passportNationality, knownTravelerNumber));
          }}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
        />
      </Field>

      <Field label="Nationality" htmlFor="passport-nationality">
        <input
          id="passport-nationality"
          type="text"
          value={passportNationality}
          onChange={(e) => {
            setPassportNationality(e.target.value);
            onDirtyChange?.(computeDirty(passportNumber, passportExpiry, e.target.value, knownTravelerNumber));
          }}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
          placeholder="e.g. American"
        />
      </Field>

      <Field label="Known traveler number (TSA PreCheck / Global Entry)" htmlFor="ktn">
        <input
          id="ktn"
          type="text"
          value={knownTravelerNumber}
          onChange={(e) => {
            setKnownTravelerNumber(e.target.value);
            onDirtyChange?.(computeDirty(passportNumber, passportExpiry, passportNationality, e.target.value));
          }}
          className={INPUT_CLASS}
          style={INPUT_STYLE}
          placeholder="e.g. 123456789"
          autoComplete="off"
        />
      </Field>

      <div className="flex items-center justify-end gap-3">
        {justSaved && (
          <span role="status" style={{ fontSize: "12px", color: "var(--accent-brand)" }}>
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
