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

export function formatAnchorDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

function formatDatePart(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function formatTimePart(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatReservationDateRange(startAt: string | undefined, endAt: string | undefined): string {
  if (startAt && !endAt) return `${formatDatePart(startAt)}, ${formatTimePart(startAt)}`;
  if (!startAt && endAt) return `${formatDatePart(endAt)}, ${formatTimePart(endAt)}`;
  if (!startAt) return "";

  const startDate = new Date(startAt);
  const endDate = new Date(endAt!);
  const sameDay = startDate.toDateString() === endDate.toDateString();

  if (sameDay) {
    return `${formatDatePart(startAt)}, ${formatTimePart(startAt)} – ${formatTimePart(endAt!)}`;
  }
  return `${formatDatePart(startAt)}, ${formatTimePart(startAt)} – ${formatDatePart(endAt!)}, ${formatTimePart(endAt!)}`;
}

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
