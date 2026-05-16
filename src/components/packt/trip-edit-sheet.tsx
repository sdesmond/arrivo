"use client";

import { useState } from "react";
import Image from "next/image";
import { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type Trip, type Collaborator, type CollaboratorRole, type Budget, type UpdateTripPatch } from "@/data/types";
import { Section, Field } from "@/components/packt/form-section";
import { TripEditCollaborators } from "@/components/packt/trip-edit-collaborators";

interface TripEditSheetProps {
  trip: Trip | null;
  open: boolean;
  onClose: () => void;
  onSave: (patch: UpdateTripPatch) => void;
}

export function TripEditSheet({ trip, open, onClose, onSave }: TripEditSheetProps) {
  const [draft, setDraft] = useState<Trip | null>(trip);

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

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent side="right" showCloseButton={false} className="flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-4 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <SheetTitle>Edit Trip</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-6">
          <Section title="Basic">
            <Field label="Trip name">
              <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
          </Section>

          <Section title="Dates">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <Input type="date" value={draft.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} />
              </Field>
              <Field label="End date">
                <Input type="date" value={draft.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Cover image">
            <Field label="Image URL">
              <Input
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
                value={draft.budget?.currency ?? ""}
                placeholder="USD"
                onChange={(e) => setBudget("currency", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total">
                <Input
                  type="number"
                  min={0}
                  value={draft.budget?.total ?? ""}
                  onChange={(e) => setBudget("total", e.target.value ? Number(e.target.value) : undefined)}
                />
              </Field>
              <Field label="Per person">
                <Input
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

        <SheetFooter className="shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: draft.name,
                startDate: draft.startDate,
                endDate: draft.endDate,
                coverImageUrl: draft.coverImageUrl,
                budgetCurrency: draft.budget?.currency,
                budgetTotal: draft.budget?.total,
                budgetPerPerson: draft.budget?.perPerson,
                tags: draft.tags,
              })
            }
          >
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
