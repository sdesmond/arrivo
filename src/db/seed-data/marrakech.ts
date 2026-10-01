import type { SeedTrip } from "./seed-types";

// Alex's past trip, deliberately sparse: dates + a budget + expenses only, no days/events/documents/
// packing. Exercises an empty itinerary view and a past trip still showing up in travel-history/spending
// with nothing else attached.
export const MARRAKECH_TRIP: SeedTrip = {
  key: "marrakech",
  ownerKey: "alex",
  name: "Marrakech",
  startOffsetDays: -365,
  endOffsetDays: -359,
  destinationName: "Marrakech",
  destinationCountry: "Morocco",
  destinationCountryCode: "MA",
  budgetCurrency: "EUR",
  budgetTotal: 950,
  expenses: [
    { category: "lodging", amount: 310, currency: "EUR", offsetDays: -365 },
    { category: "food", amount: 140, currency: "EUR", offsetDays: -363 },
    { category: "shopping", amount: 95, currency: "EUR", offsetDays: -361 },
  ],
};
