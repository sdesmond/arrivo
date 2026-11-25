import { beforeEach, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ api }));

import { useReservationPatch } from "./use-reservation-patch";
import { updateReservation } from "@/lib/api/contract/reservations";

beforeEach(() => vi.resetAllMocks());

it("patches the reservation through the API", async () => {
  api.mockResolvedValue({});
  const { result } = renderHook(() => useReservationPatch());
  await result.current("res-1", { notes: null });
  expect(api).toHaveBeenCalledWith(updateReservation, { params: { reservationId: "res-1" }, body: { notes: null } });
});

it("rejects with the API error", async () => {
  api.mockRejectedValue(new Error("The end date and time must be after the start date and time."));
  const { result } = renderHook(() => useReservationPatch());
  await expect(result.current("res-1", { endAt: null })).rejects.toThrow("must be after");
});
