import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

const { patchReservation } = vi.hoisted(() => ({ patchReservation: vi.fn() }));
vi.mock("./use-reservation-patch", () => ({ useReservationPatch: () => patchReservation }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("./reservation-field-dialog", () => ({
  ReservationFieldDialog: ({
    open,
    onSave,
  }: {
    open: boolean;
    onSave: (value?: { address: string; name?: string; lat?: number; lng?: number }) => void;
  }) =>
    open ? (
      <div>
        <button onClick={() => onSave({ address: "9 Elm St", name: "Elm", lat: 1, lng: 2 })}>dialog-save</button>
        <button onClick={() => onSave(undefined)}>dialog-remove</button>
      </div>
    ) : null,
}));

import { buildSavedLocationValue, ReservationLocationChip } from "./reservation-location-chip";
import { ReservationType } from "@/data/types";

beforeEach(() => {
  vi.resetAllMocks();
  patchReservation.mockResolvedValue(undefined);
});

it("builds a saved location only when there is an address", () => {
  expect(buildSavedLocationValue(undefined, "Name", 1, 2)).toBeUndefined();
  expect(buildSavedLocationValue("1 Main St", "Name", 1, 2)).toEqual({
    address: "1 Main St",
    name: "Name",
    lat: 1,
    lng: 2,
  });
});

it.each([
  [
    "start",
    "Check-in",
    { startAddress: "9 Elm St", startLocationName: "Elm", startLocationLat: 1, startLocationLng: 2 },
    { startAddress: null },
  ],
  [
    "end",
    "Check-out",
    { endAddress: "9 Elm St", endLocationName: "Elm", endLocationLat: 1, endLocationLng: 2 },
    { endAddress: null },
  ],
] as const)(
  "patches the %s address and clears it with only the address set to null",
  async (side, label, saved, cleared) => {
    const user = userEvent.setup();
    render(
      <ReservationLocationChip
        reservationId="res-1"
        type={ReservationType.Lodging}
        side={side}
        initialLocation={{ address: "1 Main St", name: "Old" }}
      />
    );
    await user.click(screen.getByRole("button", { name: `${label} · Old` }));
    await user.click(screen.getByRole("button", { name: "dialog-save" }));
    expect(patchReservation).toHaveBeenCalledWith("res-1", saved);
    expect(await screen.findByRole("button", { name: `${label} · Elm` })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `${label} · Elm` }));
    await user.click(screen.getByRole("button", { name: "dialog-remove" }));
    expect(patchReservation).toHaveBeenLastCalledWith("res-1", cleared);
    expect(await screen.findByRole("button", { name: `Add ${label.toLowerCase()} address` })).toBeInTheDocument();
  }
);

it("keeps the old location and shows a toast when the save fails", async () => {
  patchReservation.mockRejectedValueOnce(new Error("Network error")).mockRejectedValueOnce("oops");
  const user = userEvent.setup();
  render(<ReservationLocationChip reservationId="res-1" type={ReservationType.Lodging} side="start" />);
  await user.click(screen.getByRole("button", { name: "Add check-in address" }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Network error"));
  await user.click(screen.getByRole("button", { name: "Add check-in address" }));
  await user.click(screen.getByRole("button", { name: "dialog-save" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Failed to save."));
  expect(screen.getByRole("button", { name: "Add check-in address" })).toBeInTheDocument();
});
