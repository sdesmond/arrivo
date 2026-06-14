"use client";

import { Anchor, Bus, Car, Hotel, Package, Plane, Ship, Train, type LucideIcon } from "lucide-react";
import { ReservationType } from "@/data/types";

export const RESERVATION_TYPE_META: Record<ReservationType, { label: string; icon: LucideIcon }> = {
  flight: { label: "Flight", icon: Plane },
  train: { label: "Train", icon: Train },
  bus: { label: "Bus", icon: Bus },
  ferry: { label: "Ferry", icon: Ship },
  "rental-car": { label: "Rental Car", icon: Car },
  lodging: { label: "Lodging", icon: Hotel },
  cruise: { label: "Cruise", icon: Anchor },
  other: { label: "Other", icon: Package },
};

export interface ReservationTypeBadgeProps {
  type: ReservationType;
}

export function ReservationTypeBadge({ type }: ReservationTypeBadgeProps) {
  const { label, icon: Icon } = RESERVATION_TYPE_META[type];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </span>
  );
}
