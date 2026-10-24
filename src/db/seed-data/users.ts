import type { SeedUser } from "./seed-types";

export const DEMO_USER: SeedUser = {
  key: "demo",
  username: "demo",
  name: "Demo User",
  initials: "DU",
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
  defaultCoverType: "graphic",
  warningThreshold: 80,
  dangerThreshold: 90,
  passportNumber: "X1234567",
  passportNationality: "US",
  knownTravelerNumber: "TT-98765432",
  loyaltyNumbers: [
    { programName: "United MileagePlus", memberNumber: "UA-4471029", position: 0 },
    { programName: "Marriott Bonvoy", memberNumber: "MB-88213045", position: 1 },
  ],
  wishlistDestinations: [
    { name: "New Zealand", position: 0 },
    { name: "Vietnam", position: 1 },
  ],
  companions: [{ name: "Jamie Park", age: 34, position: 0 }],
};

export const ALEX_USER: SeedUser = {
  key: "alex",
  username: "alex",
  name: "Alex Rivera",
  initials: "AR",
  currency: "EUR",
  dateFormat: "DD/MM/YYYY",
  defaultCoverType: "map",
  warningThreshold: 70,
  dangerThreshold: 85,
  loyaltyNumbers: [{ programName: "TAP Miles&Go", memberNumber: "TP-5591203", position: 0 }],
};

export const SAM_USER: SeedUser = {
  key: "sam",
  username: "sam",
  name: "Sam Chen",
  initials: "SC",
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
};

export const JORDAN_USER: SeedUser = {
  key: "jordan",
  username: "jordan",
  name: "Jordan Lee",
  initials: "JL",
  currency: "USD",
  dateFormat: "MM/DD/YYYY",
};

export const SEED_USERS: SeedUser[] = [DEMO_USER, ALEX_USER, SAM_USER, JORDAN_USER];
