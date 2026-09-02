"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  TransitMode,
  TripCurrencyChangeMode,
  type Budget,
  type Collaborator,
  type CollaboratorRole,
  type CurrencyOption,
  type Expense,
  type Trip,
  type TripDateChangeConfirmation,
  type TripDateConflictResolution as TripDateConflictResolutionValue,
  type UpdateTripPatch,
} from "@/data/types";
import { Section, Field } from "@/components/packt/form-section";
import { GettingAroundSection } from "@/components/packt/getting-around-section";
import { TripEditBudget } from "@/components/packt/trip-edit-budget";
import { TripEditCollaborators } from "@/components/packt/trip-edit-collaborators";
import { TripEditDestination } from "@/components/packt/trip-edit-destination";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DeleteTripAlertDialog } from "@/components/packt/delete-trip-alert-dialog";
import { TripDateChangeConfirmationDialog } from "@/components/packt/trip-date-change-confirmation-dialog";
import { TripCurrencyChangeDialog } from "@/components/packt/trip-currency-change-dialog";
import { hasCurrencyChangeMismatch } from "@/lib/budget";
import { cn } from "@/lib/utils";

interface TripEditSheetProps {
  trip: Trip | null;
  currencyOptions: CurrencyOption[];
  expenses?: Expense[];
  open: boolean;
  onClose: () => void;
  onSave: (patch: UpdateTripPatch, currencyChangeMode?: TripCurrencyChangeMode) => void | Promise<void>;
  saving?: boolean;
  dateFormat?: string;
  dateChangeConfirmation?: TripDateChangeConfirmation | null;
  onResolveDateChange?: (resolution: TripDateConflictResolutionValue) => void | Promise<void>;
  onCancelDateChange?: () => void;
  onDelete?: () => void | Promise<void>;
  isDeleting?: boolean;
  highlightDates?: boolean;
  canManage?: boolean;
  canEditBudget?: boolean;
}

export function TripEditSheet({
  trip,
  currencyOptions,
  expenses = [],
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
  highlightDates = false,
  canManage = true,
  canEditBudget = true,
}: TripEditSheetProps) {
  const [draft, setDraft] = useState<Trip | null>(() => createTripDraft(trip));
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [destinationInput, setDestinationInput] = useState(trip?.destinationName ?? "");
  const [destinationPatch, setDestinationPatch] = useState<
    { name: string | null; country: string | null; countryCode: string | null } | undefined
  >(undefined);
  const [pendingCurrencyPatch, setPendingCurrencyPatch] = useState<UpdateTripPatch | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const isBusy = saving || isDeleting;
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!open) {
      setDraft(createTripDraft(trip));
      setDeleteDialogOpen(false);
      setDestinationInput(trip?.destinationName ?? "");
      setDestinationPatch(undefined);
      setPendingCurrencyPatch(null);
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
  function closeCurrencyDialog(): void {
    setPendingCurrencyPatch(null);
    restoreSaveButtonFocus();
  }
  function resolveCurrencyChange(mode: TripCurrencyChangeMode): void {
    const patch = pendingCurrencyPatch;
    setPendingCurrencyPatch(null);
    if (patch) {
      void onSave(patch, mode);
    }
  }
  function getPatch(): UpdateTripPatch {
    const currentDraft = draft;
    if (!currentDraft) {
      throw new Error("Trip draft is unavailable.");
    }

    const hadDates = !!trip?.startDate;
    const hasDraftDates = !!currentDraft.startDate;
    const startDate: string | null | undefined = hadDates && !hasDraftDates ? null : currentDraft.startDate || null;
    const endDate: string | null | undefined =
      hadDates && !hasDraftDates ? null : (currentDraft.endDate ?? currentDraft.startDate) || null;

    return {
      name: currentDraft.name,
      startDate,
      endDate,
      ...(destinationPatch !== undefined
        ? {
            destinationName: destinationPatch.name,
            destinationCountry: destinationPatch.country,
            destinationCountryCode: destinationPatch.countryCode,
          }
        : {}),
      budgetCurrency: currentDraft.budget?.currency,
      budgetTotal: currentDraft.budget?.total,
      tags: currentDraft.tags,
      transitMode: currentDraft.transitMode,
    };
  }
  async function handleResolution(resolution: TripDateConflictResolutionValue): Promise<void> {
    await onResolveDateChange?.(resolution);
  }
  function handleSaveClick(): void {
    const patch = getPatch();
    const previousCurrency = (trip?.budget?.currency ?? "").toUpperCase();
    const nextCurrency = (patch.budgetCurrency ?? "").toUpperCase();
    const isCurrencyChanging = !!nextCurrency && nextCurrency !== previousCurrency;

    if (isCurrencyChanging && hasCurrencyChangeMismatch(expenses, nextCurrency)) {
      setPendingCurrencyPatch(patch);
      return;
    }

    onSave(patch);
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
                <Input disabled={isBusy} value={draft.name} onChange={(event) => set("name", event.target.value)} />
              </Field>
            </Section>

            <Section title="Dates">
              <div
                data-testid="trip-edit-dates-field"
                className={cn("rounded-md", highlightDates && "highlight-pulse-ring")}
              >
                <DateRangePicker
                  start={draft.startDate || undefined}
                  end={draft.endDate || undefined}
                  disabled={isBusy}
                  onChange={(start, end) => {
                    set("startDate", start);
                    set("endDate", end);
                  }}
                />
              </div>
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
            {canEditBudget ? (
              <TripEditBudget
                currencyOptions={currencyOptions}
                currency={draft.budget?.currency}
                total={draft.budget?.total}
                onCurrencyChange={(currency) => setBudget("currency", currency)}
                onTotalChange={(total) => setBudget("total", total)}
                disabled={isBusy}
              />
            ) : null}
            <GettingAroundSection
              transitMode={draft.transitMode ?? TransitMode.Drive}
              onTransitModeChange={(mode) => set("transitMode", mode)}
              disabled={isBusy}
            />
            {canManage ? (
              <Section title="People">
                <TripEditCollaborators
                  collaborators={draft.collaborators ?? []}
                  onRemove={removeCollaborator}
                  onUpdateRole={updateCollaboratorRole}
                  onAdd={addCollaborator}
                />
              </Section>
            ) : null}
          </div>

          <DrawerFooter className="shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
            <div className="flex flex-row items-center justify-between gap-2">
              {onDelete ? (
                <Button
                  variant="destructive"
                  size="icon"
                  className="size-11 shrink-0"
                  title="Delete trip"
                  aria-label="Delete trip"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={isBusy}
                >
                  <Trash2 strokeWidth={1.5} />
                </Button>
              ) : (
                <div />
              )}
              <div className="flex flex-row justify-end gap-2">
                <Button variant="ghost" onClick={onClose} disabled={isBusy}>
                  Cancel
                </Button>
                <Button ref={saveButtonRef} disabled={isBusy} onClick={handleSaveClick}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
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
      <TripCurrencyChangeDialog
        isOpen={pendingCurrencyPatch !== null}
        saving={isBusy}
        onCancel={closeCurrencyDialog}
        onLeaveAsIs={() => resolveCurrencyChange(TripCurrencyChangeMode.LeaveAsIs)}
        onConvert={() => resolveCurrencyChange(TripCurrencyChangeMode.Convert)}
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
