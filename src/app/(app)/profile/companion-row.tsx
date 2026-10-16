"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Field } from "@/components/arrivo/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { updateCompanion, deleteCompanion } from "./actions";
import type { Companion, UpdateCompanionPatch } from "@/data/types";

export interface CompanionRowProps {
  companion: Companion;
}

export function CompanionRow({ companion }: CompanionRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  const [name, setName] = useState(companion.name);
  const [age, setAge] = useState(companion.age?.toString() ?? "");
  const [passportNumber, setPassportNumber] = useState(companion.passportNumber ?? "");
  const [passportExpiry, setPassportExpiry] = useState<string | undefined>(companion.passportExpiry ?? undefined);
  const [passportNationality, setPassportNationality] = useState(companion.passportNationality ?? "");
  const [knownTravelerNumber, setKnownTravelerNumber] = useState(companion.knownTravelerNumber ?? "");
  const [username, setUsername] = useState(companion.username ?? "");

  const editButtonRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isExpanded) {
      firstFieldRef.current?.focus();
    }
  }, [isExpanded]);

  function handleExpand() {
    setIsExpanded(true);
  }

  function handleCollapse() {
    setIsExpanded(false);
    editButtonRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      handleCollapse();
    }
  }

  const nameError = name.trim().length > 50 ? "Companion name must be 50 characters or fewer." : null;

  const parsedAge = age ? parseInt(age, 10) : null;
  const ageError =
    age !== "" && (parsedAge === null || isNaN(parsedAge) || parsedAge < 0 || parsedAge > 120)
      ? "Age must be between 0 and 120."
      : null;

  const passportNumberError = passportNumber.length > 20 ? "Passport number must be 20 characters or fewer." : null;
  const passportNationalityError =
    passportNationality.length > 50 ? "Nationality must be 50 characters or fewer." : null;
  const ktnError = knownTravelerNumber.length > 20 ? "Known traveler number must be 20 characters or fewer." : null;

  const hasError = !!(nameError || ageError || passportNumberError || passportNationalityError || ktnError);

  function handleSave() {
    startTransition(async () => {
      const patch: UpdateCompanionPatch = {
        name: name.trim() || companion.name,
        age: age ? parseInt(age, 10) : undefined,
        passportNumber: passportNumber || undefined,
        passportExpiry: passportExpiry,
        passportNationality: passportNationality || undefined,
        knownTravelerNumber: knownTravelerNumber || undefined,
        username: username || undefined,
      };
      const result = await updateCompanion(companion.id, patch);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      setIsExpanded(false);
      editButtonRef.current?.focus();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteCompanion(companion.id);
    });
  }

  return (
    <div
      style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}
      onKeyDown={isExpanded ? handleKeyDown : undefined}
    >
      <div className="flex items-center gap-2 py-2">
        <span style={{ flex: 1, fontSize: "calc(13px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
          {companion.name}
          {companion.age != null && (
            <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)", marginLeft: 6 }}>
              ({companion.age})
            </span>
          )}
        </span>
        {justSaved && (
          <span role="status" style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--accent-brand)" }}>
            Saved
          </span>
        )}
        <button
          ref={editButtonRef}
          type="button"
          onClick={isExpanded ? handleCollapse : handleExpand}
          aria-label={isExpanded ? `Collapse ${companion.name}` : `Edit ${companion.name}`}
          aria-expanded={isExpanded}
          className="rounded-[4px] p-0.5 transition-colors hover:bg-surface-3"
          style={{ color: "var(--fg-4)" }}
        >
          {isExpanded ? <ChevronUp size={14} strokeWidth={1.5} /> : <ChevronDown size={14} strokeWidth={1.5} />}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          aria-label={`Remove ${companion.name}`}
          className="rounded-[4px] p-0.5 transition-colors hover:bg-surface-3"
          style={{ color: "var(--fg-4)" }}
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {isExpanded && (
        <div className="pb-3 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name" htmlFor={`companion-name-${companion.id}`} error={nameError ?? undefined}>
              <Input
                ref={firstFieldRef}
                id={`companion-name-${companion.id}`}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
                aria-invalid={!!nameError || undefined}
                aria-describedby={nameError ? `companion-name-${companion.id}-error` : undefined}
              />
            </Field>

            <Field label="Age" htmlFor={`companion-age-${companion.id}`} error={ageError ?? undefined}>
              <Input
                id={`companion-age-${companion.id}`}
                type="number"
                min={0}
                max={120}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                aria-invalid={!!ageError || undefined}
                aria-describedby={ageError ? `companion-age-${companion.id}-error` : undefined}
              />
            </Field>

            <Field
              label="Passport number"
              htmlFor={`companion-passport-${companion.id}`}
              error={passportNumberError ?? undefined}
            >
              <Input
                id={`companion-passport-${companion.id}`}
                type="text"
                value={passportNumber}
                onChange={(event) => setPassportNumber(event.target.value)}
                placeholder="e.g. A12345678"
                autoComplete="off"
                aria-invalid={!!passportNumberError || undefined}
                aria-describedby={passportNumberError ? `companion-passport-${companion.id}-error` : undefined}
              />
            </Field>

            <Field label="Passport expiry">
              <DatePicker
                value={passportExpiry}
                onChange={(value) => setPassportExpiry(value)}
                placeholder="Passport expiry"
              />
            </Field>

            <Field
              label="Nationality"
              htmlFor={`companion-nationality-${companion.id}`}
              error={passportNationalityError ?? undefined}
            >
              <Input
                id={`companion-nationality-${companion.id}`}
                type="text"
                value={passportNationality}
                onChange={(event) => setPassportNationality(event.target.value)}
                placeholder="e.g. American"
                aria-invalid={!!passportNationalityError || undefined}
                aria-describedby={passportNationalityError ? `companion-nationality-${companion.id}-error` : undefined}
              />
            </Field>

            <Field
              label="Known traveler number (TSA PreCheck / Global Entry)"
              htmlFor={`companion-ktn-${companion.id}`}
              error={ktnError ?? undefined}
            >
              <Input
                id={`companion-ktn-${companion.id}`}
                type="text"
                value={knownTravelerNumber}
                onChange={(event) => setKnownTravelerNumber(event.target.value)}
                placeholder="e.g. 123456789"
                autoComplete="off"
                aria-invalid={!!ktnError || undefined}
                aria-describedby={ktnError ? `companion-ktn-${companion.id}-error` : undefined}
              />
            </Field>
          </div>

          <Field label="Username (optional)" htmlFor={`companion-username-${companion.id}`}>
            <Input
              id={`companion-username-${companion.id}`}
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="@username"
              autoComplete="off"
            />
            <span
              style={{
                fontSize: "calc(11px * var(--font-scale))",
                color: "var(--fg-4)",
                marginTop: 3,
                display: "block",
              }}
            >
              Used for future trip sharing
            </span>
          </Field>

          <div className="flex items-center justify-end gap-3">
            <Button size="sm" variant="ghost" onClick={handleCollapse} disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isPending || !name.trim() || hasError}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
