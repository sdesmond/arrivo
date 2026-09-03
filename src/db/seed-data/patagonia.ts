import type { SeedTrip } from "./seed-types";

// Demo's "someday" trip: no dates yet, so it renders in the /trips Unscheduled group instead of a
// dated section. One placeholder day, two unscheduled events, one packing list just getting started,
// no budget.
export const PATAGONIA_TRIP: SeedTrip = {
  key: "patagonia",
  ownerKey: "demo",
  name: "Patagonia (someday)",
  startOffsetDays: null,
  endOffsetDays: null,
  destinationName: "Patagonia",
  destinationCountry: "Chile",
  destinationCountryCode: "CL",
  transitMode: "drive",
  days: [{ dayNumber: 1, label: "Day 1" }],
  events: [
    {
      key: "torres-del-paine",
      name: "Torres del Paine W trek",
      dayNumber: null,
      position: 0,
      note: "Need to book refugios 6+ months out.",
    },
    {
      key: "el-chalten",
      name: "El Chaltén — Laguna de los Tres",
      dayNumber: null,
      position: 1,
    },
  ],
  packingLists: [{ key: "gear", name: "Gear", position: 0 }],
  packingItems: [
    { name: "Layers", isLabel: true, done: false, position: 0, listKey: "gear" },
    { name: "Wind shell", isLabel: false, done: true, position: 1, listKey: "gear", under: "Layers" },
    { name: "Merino base layer", isLabel: false, done: false, position: 2, listKey: "gear", under: "Layers" },
    { name: "Trekking poles", isLabel: false, done: false, position: 3, listKey: "gear" },
  ],
};
