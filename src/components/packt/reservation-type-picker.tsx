"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ReservationType } from "@/data/types";
import { RESERVATION_TYPE_META } from "./reservation-type-badge";

export interface ReservationTypePickerProps {
  onSelectType: (type: ReservationType) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ReservationTypePicker({ onSelectType, open, onOpenChange }: ReservationTypePickerProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={<Button />}>
        <Plus strokeWidth={1.5} />
        Add Reservation
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        {Object.values(ReservationType).map((type) => {
          const { label, icon: Icon } = RESERVATION_TYPE_META[type];
          return (
            <DropdownMenuItem key={type} onClick={() => onSelectType(type)}>
              <Icon size={13} strokeWidth={1.5} aria-hidden="true" />
              {label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
