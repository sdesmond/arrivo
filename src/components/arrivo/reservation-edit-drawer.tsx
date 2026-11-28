"use client";

import { Drawer, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Section } from "@/components/arrivo/form-section";
import { ReservationDetailsFields } from "@/components/arrivo/reservation-details-fields";
import { RESERVATION_TYPE_META } from "@/components/arrivo/reservation-type-badge";
import { useReservationDraft } from "@/components/arrivo/use-reservation-draft";
import type { ReservationType } from "@/data/types";
import { FileText } from "lucide-react";

export interface ReservationEditDrawerProps {
  tripId: string;
  type: ReservationType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReservationEditDrawer({ tripId, type, open, onOpenChange }: ReservationEditDrawerProps) {
  const draft = useReservationDraft({ tripId, type, open, onOpenChange });
  const { saving, handleSave } = draft;
  const { label, icon: Icon } = RESERVATION_TYPE_META[type];

  return (
    <Drawer open={open} onOpenChange={(isOpen) => !saving && onOpenChange(isOpen)} direction="right">
      <DrawerContent className="flex flex-col p-0 rounded-none">
        <DrawerHeader
          className="px-5 pt-5 pb-4 shrink-0 flex-row items-center gap-3"
          style={{ borderBottom: "1px solid var(--line)" }}
        >
          <div
            className="flex items-center justify-center rounded-lg shrink-0"
            style={{ width: 32, height: 32, background: "var(--surface-2)" }}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <div>
            <DrawerTitle>Add {label} Reservation</DrawerTitle>
            <p style={{ fontSize: "calc(11px * var(--font-scale))", color: "var(--fg-3)" }}>
              Type: {label} (cannot be changed after saving)
            </p>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4.5">
          <ReservationDetailsFields type={type} draft={draft} />

          <Section title="Documents">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText strokeWidth={1.5} />
                </EmptyMedia>
                <EmptyTitle>No documents yet</EmptyTitle>
                <EmptyDescription>
                  Attach a hotel confirmation, receipt, or other reservation document.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent />
            </Empty>
          </Section>
        </div>

        <DrawerFooter className="shrink-0 gap-3" style={{ borderTop: "1px solid var(--line)" }}>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
