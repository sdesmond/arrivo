"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Field } from "@/components/packt/form-section";
import { Button } from "@/components/ui/button";
import { updateCompanion, deleteCompanion } from "./actions";
import type { Companion, UpdateCompanionPatch } from "@/data/types";

export interface CompanionRowProps {
  companion: Companion;
}

const INPUT_CLASS = "w-full rounded-[6px] px-2.5 py-1.5 outline-none transition-colors";
const INPUT_STYLE: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--fg)",
  border: "1px solid var(--line)",
  fontSize: "calc(13px * var(--font-scale))",
};

export function CompanionRow({ companion }: CompanionRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  const [name, setName] = useState(companion.name);
  const [age, setAge] = useState(companion.age?.toString() ?? "");
  const [passportNumber, setPassportNumber] = useState(companion.passportNumber ?? "");
  const [passportExpiry, setPassportExpiry] = useState(companion.passportExpiry ?? "");
  const [passportNationality, setPassportNationality] = useState(companion.passportNationality ?? "");
  const [knownTravelerNumber, setKnownTravelerNumber] = useState(companion.knownTravelerNumber ?? "");
  const [packtUsername, setPacktUsername] = useState(companion.packtUsername ?? "");

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      handleCollapse();
    }
  }

  function handleSave() {
    startTransition(async () => {
      const patch: UpdateCompanionPatch = {
        name: name.trim() || companion.name,
        age: age ? parseInt(age, 10) : undefined,
        passportNumber: passportNumber || undefined,
        passportExpiry: passportExpiry || undefined,
        passportNationality: passportNationality || undefined,
        knownTravelerNumber: knownTravelerNumber || undefined,
        packtUsername: packtUsername || undefined,
      };
      await updateCompanion(companion.id, patch);
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
            <Field label="Name" htmlFor={`companion-name-${companion.id}`}>
              <input
                ref={firstFieldRef}
                id={`companion-name-${companion.id}`}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
                autoComplete="off"
              />
            </Field>

            <Field label="Age" htmlFor={`companion-age-${companion.id}`}>
              <input
                id={`companion-age-${companion.id}`}
                type="number"
                min={0}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <Field label="Passport number" htmlFor={`companion-passport-${companion.id}`}>
              <input
                id={`companion-passport-${companion.id}`}
                type="text"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                placeholder="e.g. A12345678"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
                autoComplete="off"
              />
            </Field>

            <Field label="Passport expiry" htmlFor={`companion-expiry-${companion.id}`}>
              <input
                id={`companion-expiry-${companion.id}`}
                type="date"
                value={passportExpiry}
                onChange={(e) => setPassportExpiry(e.target.value)}
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <Field label="Nationality" htmlFor={`companion-nationality-${companion.id}`}>
              <input
                id={`companion-nationality-${companion.id}`}
                type="text"
                value={passportNationality}
                onChange={(e) => setPassportNationality(e.target.value)}
                placeholder="e.g. American"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
              />
            </Field>

            <Field
              label="Known traveler number (TSA PreCheck / Global Entry)"
              htmlFor={`companion-ktn-${companion.id}`}
            >
              <input
                id={`companion-ktn-${companion.id}`}
                type="text"
                value={knownTravelerNumber}
                onChange={(e) => setKnownTravelerNumber(e.target.value)}
                placeholder="e.g. 123456789"
                className={INPUT_CLASS}
                style={INPUT_STYLE}
                autoComplete="off"
              />
            </Field>
          </div>

          <Field label="Packt username (optional)" htmlFor={`companion-packt-${companion.id}`}>
            <input
              id={`companion-packt-${companion.id}`}
              type="text"
              value={packtUsername}
              onChange={(e) => setPacktUsername(e.target.value)}
              placeholder="@username"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
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
            <Button size="sm" onClick={handleSave} disabled={isPending || !name.trim()}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
