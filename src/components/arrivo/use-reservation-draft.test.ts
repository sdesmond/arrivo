import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ReservationType } from "@/data/types";
import { ApiClientError } from "@/lib/api/client";
import { useReservationDraft } from "./use-reservation-draft";

const { createReservation, requestIds, refresh } = vi.hoisted(() => ({
  createReservation: vi.fn(),
  requestIds: [] as string[],
  refresh: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/api/client", () => ({
  api: (_endpoint: unknown, input: { params: { tripId: string }; body: { id: string } }) => {
    const { id, ...body } = input.body;
    requestIds.push(id);
    return createReservation(input.params.tripId, body);
  },
  ApiClientError: class extends Error {
    constructor(
      readonly status: number,
      _code: string,
      message: string
    ) {
      super(message);
    }
  },
}));

function renderDraft(type: ReservationType = ReservationType.Flight) {
  const onOpenChange = vi.fn();
  const view = renderHook(
    ({ open }: { open: boolean }) => useReservationDraft({ tripId: "trip-1", type, open, onOpenChange }),
    { initialProps: { open: true } }
  );
  return { ...view, onOpenChange };
}

type DraftResult = ReturnType<typeof renderDraft>["result"];

async function save(result: DraftResult): Promise<void> {
  await act(async () => {
    await result.current.handleSave();
  });
}

function attachAnchor(ref: React.RefObject<HTMLDivElement | null>): HTMLInputElement {
  const container = document.createElement("div");
  const input = document.createElement("input");
  container.append(input);
  document.body.append(container);
  ref.current = container;
  return input;
}

describe("useReservationDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createReservation.mockReset();
    requestIds.length = 0;
    document.body.replaceChildren();
  });

  it("focuses the provider input when the drawer opens", () => {
    const { result, rerender } = renderDraft();
    rerender({ open: false });
    const input = document.createElement("input");
    document.body.append(input);
    result.current.providerInputRef.current = input;

    rerender({ open: true });

    expect(input).toHaveFocus();
  });

  it("requires a provider and focuses it", async () => {
    const { result } = renderDraft();
    const input = document.createElement("input");
    document.body.append(input);
    result.current.providerInputRef.current = input;

    act(() => result.current.setProvider("   "));
    await save(result);

    expect(result.current.providerError).toBe("Provider is required.");
    expect(input).toHaveFocus();
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("requires both a date and a time for the start anchor", async () => {
    const { result } = renderDraft();
    const startInput = attachAnchor(result.current.startAnchorRef);

    act(() => {
      result.current.setProvider("Acme Air");
      result.current.setStartDate("2026-08-01");
    });
    await save(result);

    expect(result.current.startAtError).toBe("Enter both a date and a time.");
    expect(startInput).toHaveFocus();
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("requires both a date and a time for the end anchor", async () => {
    const { result } = renderDraft();
    const endInput = attachAnchor(result.current.endAnchorRef);

    act(() => {
      result.current.setProvider("Acme Air");
      result.current.setEndTime("11:00");
    });
    await save(result);

    expect(result.current.endAtError).toBe("Enter both a date and a time.");
    expect(endInput).toHaveFocus();
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("requires the end anchor for types that need one", async () => {
    const { result } = renderDraft(ReservationType.Lodging);
    const endInput = attachAnchor(result.current.endAnchorRef);

    act(() => result.current.setProvider("Grand Hotel"));
    await save(result);

    expect(result.current.endAtError).toBe("Check-out is required for this reservation type.");
    expect(endInput).toHaveFocus();
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("requires a start anchor when the end anchor is set", async () => {
    const { result } = renderDraft();
    const startInput = attachAnchor(result.current.startAnchorRef);

    act(() => {
      result.current.setProvider("Acme Air");
      result.current.setEndDate("2026-08-05");
      result.current.setEndTime("11:00");
    });
    await save(result);

    expect(result.current.startAtError).toBe("Departure is required when arrival is set.");
    expect(startInput).toHaveFocus();
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("rejects an end anchor before the start anchor", async () => {
    const { result } = renderDraft(ReservationType.Lodging);
    const endInput = attachAnchor(result.current.endAnchorRef);

    act(() => {
      result.current.setProvider("Grand Hotel");
      result.current.setStartDate("2026-08-05");
      result.current.setStartTime("15:00");
      result.current.setEndDate("2026-08-01");
      result.current.setEndTime("11:00");
    });
    await save(result);

    expect(result.current.endAtError).toBe("Check-out must be after check-in.");
    expect(endInput).toHaveFocus();
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("clears earlier errors on the next save", async () => {
    createReservation.mockResolvedValueOnce(undefined);
    const { result } = renderDraft();

    await save(result);
    expect(result.current.providerError).toBe("Provider is required.");
    act(() => result.current.setProvider("Acme Air"));
    await save(result);

    expect(result.current.providerError).toBeUndefined();
  });

  it("saves the trimmed draft with resolved locations, then refreshes and closes", async () => {
    createReservation.mockResolvedValueOnce(undefined);
    const { result, onOpenChange } = renderDraft();

    act(() => {
      result.current.setProvider("  Acme Air ");
      result.current.setStartDate("2026-08-01");
      result.current.setStartTime("10:00");
      result.current.setStartAddress("Queens, NY 11430");
      result.current.setStartResolvedLocation({
        name: "JFK Airport",
        address: "Queens, NY 11430",
        lat: 40.6413,
        lng: -73.7781,
      });
      result.current.setEndAddress("Los Angeles");
      result.current.setConfirmationCode("ABC123");
      result.current.setServiceNumber("AA123");
      result.current.setNotes("Bring ID");
    });
    await save(result);

    expect(createReservation).toHaveBeenCalledWith("trip-1", {
      type: ReservationType.Flight,
      provider: "Acme Air",
      startAt: "2026-08-01T10:00:00.000Z",
      endAt: undefined,
      startAddress: "Queens, NY 11430",
      startLocationName: "JFK Airport",
      startLocationLat: 40.6413,
      startLocationLng: -73.7781,
      endAddress: "Los Angeles",
      endLocationName: undefined,
      endLocationLat: undefined,
      endLocationLng: undefined,
      confirmationCode: "ABC123",
      serviceNumber: "AA123",
      notes: "Bring ID",
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.info).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(false);
  });

  it("reports saving while the request is in flight", async () => {
    let finish!: () => void;
    createReservation.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderDraft();
    act(() => result.current.setProvider("Acme Air"));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleSave();
    });
    await waitFor(() => expect(result.current.saving).toBe(true));
    await act(async () => {
      finish();
      await pending;
    });

    expect(result.current.saving).toBe(false);
  });

  it("resets every field and error when the drawer closes", async () => {
    createReservation.mockRejectedValueOnce(new Error("Network error"));
    const { result, rerender } = renderDraft();

    act(() => {
      result.current.setProvider("Acme Air");
      result.current.setStartDate("2026-08-01");
    });
    await save(result);
    act(() => {
      result.current.setStartTime("10:00");
      result.current.setEndDate("2026-08-02");
      result.current.setEndTime("11:00");
      result.current.setStartAddress("A");
      result.current.setStartResolvedLocation({ address: "A" });
      result.current.setEndAddress("B");
      result.current.setEndResolvedLocation({ address: "B" });
      result.current.setConfirmationCode("C");
      result.current.setServiceNumber("S");
      result.current.setNotes("N");
    });
    expect(result.current.startAtError).toBe("Enter both a date and a time.");

    rerender({ open: false });

    expect(result.current).toMatchObject({
      provider: "",
      startDate: undefined,
      startTime: undefined,
      endDate: undefined,
      endTime: undefined,
      startAddress: "",
      startResolvedLocation: undefined,
      endAddress: "",
      endResolvedLocation: undefined,
      confirmationCode: "",
      serviceNumber: "",
      notes: "",
      providerError: undefined,
      startAtError: undefined,
      endAtError: undefined,
      saving: false,
    });
  });

  it("reuses the attempt ID and original input after an uncertain failure", async () => {
    createReservation.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(undefined);
    const { result } = renderDraft();

    act(() => result.current.setProvider("Original"));
    await save(result);
    expect(toast.error).toHaveBeenCalledWith("Network error");
    act(() => result.current.setProvider("Changed"));
    await save(result);

    expect(requestIds[1]).toBe(requestIds[0]);
    expect(createReservation.mock.calls[1][1]).toMatchObject({ provider: "Original" });
    expect(toast.info).toHaveBeenCalledWith("Your earlier reservation was saved. Your recent changes were not saved.");
  });

  it.each([408, 409, 429, 500])("keeps the attempt ID after a %s response", async (status) => {
    createReservation
      .mockRejectedValueOnce(new ApiClientError(status, "code", "Failed"))
      .mockResolvedValueOnce(undefined);
    const { result } = renderDraft();

    act(() => result.current.setProvider("Misc"));
    await save(result);
    await save(result);

    expect(requestIds[1]).toBe(requestIds[0]);
  });

  it("starts a new attempt after a definite client error", async () => {
    createReservation
      .mockRejectedValueOnce(new ApiClientError(422, "validation_failed", "Check the fields."))
      .mockResolvedValueOnce(undefined);
    const { result } = renderDraft();

    act(() => result.current.setProvider("Misc"));
    await save(result);
    await save(result);

    expect(requestIds[1]).not.toBe(requestIds[0]);
  });

  it("starts a new attempt after the drawer is reopened", async () => {
    createReservation.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(undefined);
    const { result, rerender } = renderDraft();

    act(() => result.current.setProvider("Misc"));
    await save(result);
    rerender({ open: false });
    rerender({ open: true });
    act(() => result.current.setProvider("Misc"));
    await save(result);

    expect(requestIds[1]).not.toBe(requestIds[0]);
  });

  it("falls back to a generic message for a non-Error failure", async () => {
    createReservation.mockRejectedValueOnce("nope");
    const { result } = renderDraft();

    act(() => result.current.setProvider("Misc"));
    await save(result);

    expect(toast.error).toHaveBeenCalledWith("Failed to save reservation.");
  });
});
