import { TripDetailTab } from "@/data/types";

type SearchParamValue = string | string[] | null | undefined;

interface SearchParamsLike {
  toString(): string;
}

export function readSearchParamValue(value: SearchParamValue): string | undefined {
  if (value == null) {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
}

export function resolveTripDetailTab(value: SearchParamValue): TripDetailTab {
  const resolvedValue = readSearchParamValue(value);

  switch (resolvedValue) {
    case TripDetailTab.Budget:
    case TripDetailTab.Map:
    case TripDetailTab.Documents:
    case TripDetailTab.Packing:
    case TripDetailTab.Notes:
    case TripDetailTab.Reservations:
      return resolvedValue;
    default:
      return TripDetailTab.Itinerary;
  }
}

export function buildTripDetailTabHref(
  pathname: string,
  searchParams: SearchParamsLike,
  nextTab: TripDetailTab
): string {
  const nextSearchParams = new URLSearchParams(searchParams.toString());

  if (nextTab === TripDetailTab.Itinerary) {
    nextSearchParams.delete("tab");
  } else {
    nextSearchParams.set("tab", nextTab);
  }

  const nextQueryString = nextSearchParams.toString();
  return nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
}

export type ReservationsDeepLinkTarget = { kind: "add-reservation" } | { kind: "highlight"; reservationId: string };

export function buildReservationsDeepLinkHref(
  pathname: string,
  searchParams: SearchParamsLike,
  target: ReservationsDeepLinkTarget
): string {
  const nextSearchParams = new URLSearchParams(searchParams.toString());
  nextSearchParams.set("tab", TripDetailTab.Reservations);
  nextSearchParams.delete("focus");

  if (target.kind === "add-reservation") {
    nextSearchParams.set("action", "add-reservation");
    nextSearchParams.delete("highlight");
  } else if (target.reservationId) {
    nextSearchParams.set("highlight", target.reservationId);
    nextSearchParams.delete("action");
  } else {
    nextSearchParams.delete("highlight");
    nextSearchParams.delete("action");
  }

  const nextQueryString = nextSearchParams.toString();
  return nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
}
