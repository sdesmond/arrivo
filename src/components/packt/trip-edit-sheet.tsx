"use client";

import { useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  type Budget,
  type Collaborator,
  type CollaboratorRole,
  type Trip,
  type TripDateChangeConfirmation,
  type TripDateConflictResolution as TripDateConflictResolutionValue,
  type UpdateTripPatch,
} from "@/data/types";
import { Section, Field } from "@/components/packt/form-section";
import { TripEditBudget } from "@/components/packt/trip-edit-budget";
import { TripEditCollaborators } from "@/components/packt/trip-edit-collaborators";
import { TripEditCover } from "@/components/packt/trip-edit-cover";
import { TripEditDestination } from "@/components/packt/trip-edit-destination";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DeleteTripAlertDialog } from "@/components/packt/delete-trip-alert-dialog";
import { TripDateChangeConfirmationDialog } from "@/components/packt/trip-date-change-confirmation-dialog";

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
  onDelete?: () => void | Promise<void>;
  isDeleting?: boolean;
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
  onDelete,
  isDeleting = false,
}: TripEditSheetProps) {
  const [draft, setDraft] = useState<Trip | null>(() => createTripDraft(trip));
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [destinationInput, setDestinationInput] = useState(trip?.destinationName ?? "");
  const [destinationPatch, setDestinationPatch] = useState<
    { name: string | null; country: string | null; countryCode: string | null } | undefined
  >(undefined);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const isBusy = saving || isDeleting;
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!open) {
      setDraft(createTripDraft(trip));
      setDeleteDialogOpen(false);
      setDestinationInput(trip?.destinationName ?? "");
      setDestinationPatch(undefined);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, trip]);

  if (!draft) return null;
  function set<K extends keyof Trip>(key: K, value: Trip[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }
  function setBudget(key: keyof Budget, value: string | number | undefined) {
    setDraft((prev) => {
      if (!prev) return prev;
      const budget = { currency: "USD", ...prev.budget, [key]: value ?? undefined };
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

    const coverImageUrl =
      trip?.coverImageUrl === undefined && currentDraft.coverImageUrl === undefined
        ? undefined
        : currentDraft.coverImageUrl || null;

    return {
      name: currentDraft.name,
      startDate: currentDraft.startDate,
      endDate: currentDraft.endDate ?? currentDraft.startDate,
      coverImageUrl,
      ...(destinationPatch !== undefined
        ? {
            destinationName: destinationPatch.name,
            destinationCountry: destinationPatch.country,
            destinationCountryCode: destinationPatch.countryCode,
          }
        : {}),
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
          if (!isOpen && !isBusy) onClose();
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
                <Input disabled={isBusy} value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
            </Section>

            <Section title="Dates">
              <DateRangePicker
                start={draft.startDate || undefined}
                end={draft.endDate || undefined}
                disabled={isBusy}
                onChange={(start, end) => {
                  set("startDate", start);
                  set("endDate", end);
                }}
              />
            </Section>
            <TripEditDestination
              value={destinationInput}
              onInputChange={setDestinationInput}
              onSelect={(data) => {
                setDestinationInput(data.name);
                setDestinationPatch({ name: data.name, country: data.country, countryCode: data.countryCode });
              }}
              onClear={() => {
                setDestinationInput("");
                setDestinationPatch({ name: null, country: null, countryCode: null });
              }}
              disabled={isBusy}
            />
            <TripEditCover
              tripId={draft.id}
              tripName={draft.name}
              coverImageUrl={draft.coverImageUrl}
              onCoverImageUrlChange={(url) => set("coverImageUrl", url ?? undefined)}
              disabled={isBusy}
              destinationName={
                destinationPatch !== undefined ? (destinationPatch.name ?? undefined) : draft.destinationName
              }
              destinationCountry={
                destinationPatch !== undefined ? (destinationPatch.country ?? undefined) : draft.destinationCountry
              }
            />
            <TripEditBudget
              currency={draft.budget?.currency}
              total={draft.budget?.total}
              perPerson={draft.budget?.perPerson}
              onCurrencyChange={(currency) => setBudget("currency", currency)}
              onTotalChange={(total) => setBudget("total", total)}
              onPerPersonChange={(perPerson) => setBudget("perPerson", perPerson)}
              disabled={isBusy}
            />
            <Section title="People">
              <TripEditCollaborators
                collaborators={draft.collaborators ?? []}
                onRemove={removeCollaborator}
                onUpdateRole={updateCollaboratorRole}
                onAdd={addCollaborator}
              />
            </Section>
          </div>

          <DrawerFooter className="shrink-0 gap-3" style={{ borderTop: "1px solid var(--line)" }}>
            {onDelete ? (
              <>
                <Separator />
                <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={isBusy}>
                  Delete trip
                </Button>
              </>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={onClose} disabled={isBusy}>
                Cancel
              </Button>
              <Button ref={saveButtonRef} disabled={isBusy} onClick={() => onSave(getPatch())}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {onDelete ? (
        <DeleteTripAlertDialog
          tripName={draft.name}
          open={isDeleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          onConfirm={() => {
            void onDelete();
          }}
          isDeleting={isDeleting}
        />
      ) : null}
      <TripDateChangeConfirmationDialog
        dateChangeConfirmation={dateChangeConfirmation ?? null}
        dateFormat={dateFormat}
        saving={saving}
        onResolveDateChange={handleResolution}
        onCancelDateChange={closeDateChangeDialog}
      />
    </>
  );
}

function createTripDraft(trip: Trip | null): Trip | null {
  if (!trip) return null;

  return {
    ...trip,
    tags: trip.tags ? [...trip.tags] : undefined,
    budget: trip.budget ? { ...trip.budget } : undefined,
    collaborators: trip.collaborators ? trip.collaborators.map((collaborator) => ({ ...collaborator })) : undefined,
    docs: trip.docs ? [...trip.docs] : undefined,
  };
}
