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

export const ANCHOR_LABELS: Record<ReservationType, { start: string; end: string }> = {
  flight: { start: "Departure", end: "Arrival" },
  train: { start: "Departure", end: "Arrival" },
  bus: { start: "Departure", end: "Arrival" },
  ferry: { start: "Departure", end: "Arrival" },
  "rental-car": { start: "Pickup", end: "Return" },
  lodging: { start: "Check-in", end: "Check-out" },
  cruise: { start: "Departure", end: "Return" },
  other: { start: "Start", end: "End" },
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
