"use client";

import type { z } from "zod";
import { api } from "@/lib/api/client";
import { updateReservation } from "@/lib/api/contract/reservations";

export type ReservationPatchBody = z.input<typeof updateReservation.body>;

/**
 * Patches one reservation through the API. The trip page's live refresh brings back server data, such as the days a
 * widened date adds, so this does not refresh itself. Failures reject with the API error for the field to report.
 */
export function useReservationPatch(): (reservationId: string, body: ReservationPatchBody) => Promise<void> {
  return patchReservation;
}

async function patchReservation(reservationId: string, body: ReservationPatchBody): Promise<void> {
  await api(updateReservation, { params: { reservationId }, body });
}
