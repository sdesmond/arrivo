"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Drawer, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type Trip,
  type Collaborator,
  type CollaboratorRole,
  type Budget,
  type UpdateTripPatch,
  type TripDateChangeConfirmation,
  TripDateConflictResolution,
  type TripDateConflictResolution as TripDateConflictResolutionValue,
} from "@/data/types";
import { Section, Field } from "@/components/packt/form-section";
import { TripEditCollaborators } from "@/components/packt/trip-edit-collaborators";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatDate } from "@/lib/utils";

interface TripEditSheetProps {
  trip: Trip | null;
  open: boolean;
  onClose: () => void;
  onSave: (patch: UpdateTripPatch) => void | Promise<void>;
  saving?: boolean;
  dateFormat?: string;
  dateChangeConfirmation?: TripDateChangeConfirmation | null;
  onResolveDateChange?: (resolution: TripDateConflictResolutionValue) => void | Promise<void>;
  onCancelDateChange?: () => void;
}

export function TripEditSheet({
  trip,
  open,
  onClose,
  onSave,
  saving = false,
  dateFormat = "MM/DD/YYYY",
  dateChangeConfirmation,
  onResolveDateChange,
  onCancelDateChange,
}: TripEditSheetProps) {
  const [draft, setDraft] = useState<Trip | null>(trip);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);

  if (!draft) return null;

  function set<K extends keyof Trip>(key: K, value: Trip[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function setBudget(key: keyof Budget, value: string | number | undefined) {
    setDraft((prev) => {
      if (!prev) return prev;
      const budget = { currency: "USD", ...prev.budget, [key]: value || undefined };
      return { ...prev, budget };
    });
  }

  function removeCollaborator(index: number) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            collaborators: prev.collaborators?.filter((_, i) => i !== index),
          }
        : prev
    );
  }

  function updateCollaboratorRole(index: number, role: CollaboratorRole) {
    setDraft((prev) => {
      if (!prev?.collaborators) return prev;
      const updated = [...prev.collaborators];
      updated[index] = { ...updated[index], role };
      return { ...prev, collaborators: updated };
    });
  }

  function addCollaborator(name: string, email: string, role: CollaboratorRole) {
    const parts = name.split(" ");
    const initials = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
    const collab: Collaborator = { name, email, initials, role };
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            collaborators: [...(prev.collaborators ?? []), collab],
          }
        : prev
    );
  }

  function restoreSaveButtonFocus(): void {
    requestAnimationFrame(() => {
      saveButtonRef.current?.focus();
    });
  }

  function closeDateChangeDialog(): void {
    onCancelDateChange?.();
    restoreSaveButtonFocus();
  }

  function getPatch(): UpdateTripPatch {
    const currentDraft = draft;
    if (!currentDraft) {
      throw new Error("Trip draft is unavailable.");
    }

    return {
      name: currentDraft.name,
      startDate: currentDraft.startDate,
      endDate: currentDraft.endDate ?? currentDraft.startDate,
      coverImageUrl: currentDraft.coverImageUrl,
      budgetCurrency: currentDraft.budget?.currency,
      budgetTotal: currentDraft.budget?.total,
      budgetPerPerson: currentDraft.budget?.perPerson,
      tags: currentDraft.tags,
    };
  }

  async function handleResolution(resolution: TripDateConflictResolutionValue): Promise<void> {
    await onResolveDateChange?.(resolution);
  }

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && !saving) onClose();
        }}
        direction="right"
      >
        <DrawerContent className="flex flex-col p-0 rounded-none">
          <DrawerHeader className="px-5 pt-5 pb-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
            <DrawerTitle>Edit Trip</DrawerTitle>
          </DrawerHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
            <Section title="Basic">
              <Field label="Trip name">
                <Input disabled={saving} value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
            </Section>

            <Section title="Dates">
              <DateRangePicker
                from={draft.startDate || undefined}
                to={draft.endDate || undefined}
                disabled={saving}
                onChange={(from, to) => {
                  set("startDate", from);
                  set("endDate", to);
                }}
              />
            </Section>

            <Section title="Cover image">
              <Field label="Image URL">
                <Input
                  disabled={saving}
                  value={draft.coverImageUrl ?? ""}
                  placeholder="https://…"
                  onChange={(e) => set("coverImageUrl", e.target.value || undefined)}
                />
              </Field>
              {draft.coverImageUrl && (
                <Image
                  src={draft.coverImageUrl}
                  alt={draft.name}
                  width={400}
                  height={120}
                  unoptimized
                  style={{
                    width: "100%",
                    maxHeight: 120,
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                  }}
                />
              )}
            </Section>

            <Section title="Budget">
              <Field label="Currency">
                <Input
                  disabled={saving}
                  value={draft.budget?.currency ?? ""}
                  placeholder="USD"
                  onChange={(e) => setBudget("currency", e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total">
                  <Input
                    disabled={saving}
                    type="number"
                    min={0}
                    value={draft.budget?.total ?? ""}
                    onChange={(e) => setBudget("total", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </Field>
                <Field label="Per person">
                  <Input
                    disabled={saving}
                    type="number"
                    min={0}
                    value={draft.budget?.perPerson ?? ""}
                    onChange={(e) => setBudget("perPerson", e.target.value ? Number(e.target.value) : undefined)}
                  />
                </Field>
              </div>
            </Section>

            <Section title="People">
              <TripEditCollaborators
                collaborators={draft.collaborators ?? []}
                onRemove={removeCollaborator}
                onUpdateRole={updateCollaboratorRole}
                onAdd={addCollaborator}
              />
            </Section>
          </div>

          <DrawerFooter className="shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button ref={saveButtonRef} disabled={saving} onClick={() => onSave(getPatch())}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <AlertDialog
        open={dateChangeConfirmation !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeDateChangeDialog();
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Date Change</AlertDialogTitle>
            <AlertDialogDescription>
              This date change removes scheduled days on{" "}
              {dateChangeConfirmation?.removedDates.map((date) => formatDate(date, dateFormat)).join(", ")}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {dateChangeConfirmation && (
            <div className="space-y-3" style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}>
              {dateChangeConfirmation.events.length > 0 && (
                <div className="space-y-2">
                  <p>These events will be displaced:</p>
                  <ul className="space-y-1" style={{ color: "var(--fg)" }}>
                    {dateChangeConfirmation.events.map((event) => (
                      <li key={event.id}>
                        {event.name}
                        {event.displacedDate ? ` · ${formatDate(event.displacedDate, dateFormat)}` : ""}
                        {event.docCount > 0 ? ` · ${event.docCount} doc${event.docCount === 1 ? "" : "s"}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dateChangeConfirmation.noteCount > 0 && (
                <p>
                  {dateChangeConfirmation.noteCount} note{dateChangeConfirmation.noteCount === 1 ? "" : "s"} on the
                  removed days will be deleted.
                </p>
              )}
              {dateChangeConfirmation.checklistCount > 0 && (
                <p>
                  {dateChangeConfirmation.checklistCount} checklist
                  {dateChangeConfirmation.checklistCount === 1 ? "" : "s"} on the removed days will be deleted.
                </p>
              )}
              {dateChangeConfirmation.eventDocumentCount > 0 && (
                <p>
                  Choosing Delete events also deletes {dateChangeConfirmation.eventDocumentCount} attached event
                  document{dateChangeConfirmation.eventDocumentCount === 1 ? "" : "s"}.
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving} onClick={closeDateChangeDialog}>
              Cancel
            </AlertDialogCancel>
            {dateChangeConfirmation?.events.length ? (
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => handleResolution(TripDateConflictResolution.KeepAsUnscheduled)}
              >
                Keep as unscheduled
              </Button>
            ) : null}
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={() => handleResolution(TripDateConflictResolution.DeleteEvents)}
            >
              Delete events
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
