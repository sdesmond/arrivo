"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, Section } from "@/components/packt/form-section";
import type { NewTripDraft } from "@/data/types";

export interface NewTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate?: (draft: NewTripDraft) => void;
  isPending?: boolean;
}

const EMPTY_DRAFT: NewTripDraft = {
  title: "",
  startDate: undefined,
  endDate: undefined,
  budgetAmount: "",
};

function sanitizeBudget(value: string) {
  const numeric = value.replace(/[^\d.]/g, "");
  const [whole, ...decimalParts] = numeric.split(".");
  const decimal = decimalParts.join("");
  return decimalParts.length > 0 ? `${whole}.${decimal.slice(0, 2)}` : whole;
}

export function NewTripDialog({ open, onOpenChange, onCreate, isPending = false }: NewTripDialogProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<NewTripDraft>(EMPTY_DRAFT);
  const [titleError, setTitleError] = useState("");

  useEffect(() => {
    if (!open) return;
    const timerId = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(timerId);
  }, [open]);

  function closeDialog() {
    setDraft(EMPTY_DRAFT);
    setTitleError("");
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();

    if (!title) {
      setTitleError("Enter a trip title.");
      titleRef.current?.focus();
      return;
    }

    if (onCreate) {
      onCreate({
        title,
        startDate: draft.startDate,
        endDate: draft.endDate,
        budgetAmount: draft.budgetAmount?.replace(/\.$/, "") || undefined,
      });
      return;
    }

    closeDialog();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeDialog();
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-lg" showCloseButton>
        <form onSubmit={handleSubmit}>
          <DialogHeader className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--line)" }}>
            <DialogTitle>New Trip</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 px-5 py-4">
            <Section title="Basics">
              <Field label="Title" htmlFor="new-trip-title" error={titleError}>
                <Input
                  id="new-trip-title"
                  ref={titleRef}
                  value={draft.title}
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? "new-trip-title-error" : undefined}
                  onChange={(event) => {
                    setDraft((prev) => ({ ...prev, title: event.target.value }));
                    if (titleError) setTitleError("");
                  }}
                />
              </Field>
            </Section>

            <Section title="Dates">
              <DateRangePicker
                from={draft.startDate}
                to={draft.endDate}
                placeholder="Optional date range"
                onChange={(startDate, endDate) => setDraft((prev) => ({ ...prev, startDate, endDate }))}
              />
            </Section>

            <Section title="Budget">
              <Field label="Budget" htmlFor="new-trip-budget">
                <Input
                  id="new-trip-budget"
                  inputMode="decimal"
                  placeholder="Optional amount"
                  value={draft.budgetAmount ?? ""}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, budgetAmount: sanitizeBudget(event.target.value) }))
                  }
                />
              </Field>
            </Section>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={draft.title.trim().length === 0 || isPending}>
              {isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
