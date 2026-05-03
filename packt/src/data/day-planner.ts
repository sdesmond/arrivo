export type EventState = "done" | "now" | "next";

export interface TravelTo {
  mode: string;
  detail: string;
  min: number;
}

export interface DocLine {
  text: string;
  level: "h" | "m" | "b" | "sm" | "";
}

export interface PlannerDoc {
  id: string;
  name: string;
  kind: "pdf" | "image" | "doc";
  size: string;
  offline: boolean;
  previewLines?: DocLine[];
}

export interface TimedEvent {
  id: string;
  time: string;
  durMin: number;
  end: string;
  name: string;
  cat: string;
  state: EventState;
  where: string;
  coords: { x: number; y: number };
  note?: string;
  travelTo?: TravelTo;
  confirmation?: { label: string; code: string };
  docs?: PlannerDoc[];
}

export interface FlexibleEvent {
  id: string;
  name: string;
  cat: string;
  bucket: "morning" | "afternoon" | "evening";
  where: string;
}

export const TIMED: TimedEvent[] = [
  {
    id: "tsukiji", time: "09:30", durMin: 90, end: "11:00",
    name: "Tsukiji Outer Market", cat: "Food", state: "done",
    where: "Tsukiji · 4-chōme",
    coords: { x: 0.20, y: 0.36 },
    note: "Brought cash. Got tamagoyaki + uni at Sushi Bun. Wait was 25 min.",
  },
  {
    id: "teamlab", time: "11:30", durMin: 120, end: "13:30",
    name: "teamLab Planets", cat: "Museum", state: "done",
    where: "Toyosu · timed entry",
    coords: { x: 0.34, y: 0.55 },
    travelTo: { mode: "Subway", detail: "Yurakucho line", min: 12 },
    note: "Timed entry 11:30 confirmed in app. Bring shorts (water rooms).",
    confirmation: { label: "Order", code: "TLP-9F2K-7741" },
    docs: [
      {
        id: "tl-1", name: "teamLab Planets — 2 tickets.pdf", kind: "pdf", size: "184 KB", offline: true,
        previewLines: [
          { text: "TEAMLAB PLANETS TOKYO", level: "h" },
          { text: "Order TLP-9F2K-7741", level: "m" },
          { text: "", level: "" },
          { text: "Friday, April 28 · 11:30 entry", level: "b" },
          { text: "2 × Adult · ¥3,800 each", level: "b" },
          { text: "", level: "" },
          { text: "QR code at entry — phone or print", level: "sm" },
        ],
      },
    ],
  },
  {
    id: "lunch", time: "13:45", durMin: 60, end: "14:45",
    name: "Bills · Odaiba", cat: "Lunch", state: "done",
    where: "Odaiba · DiverCity",
    coords: { x: 0.42, y: 0.62 },
    travelTo: { mode: "Walk", detail: "covered arcade", min: 8 },
  },
  {
    id: "hama", time: "15:00", durMin: 90, end: "16:30",
    name: "Hamarikyu Gardens", cat: "Park", state: "now",
    where: "Chuo · pond + tea house",
    coords: { x: 0.30, y: 0.43 },
    travelTo: { mode: "Train", detail: "Yurikamome line", min: 14 },
    note: "Tea ceremony at 15:30 in Nakajima-no-Ochaya · ¥850. Reserve at entrance.",
    docs: [
      {
        id: "hm-1", name: "Garden map + tea house guide.pdf", kind: "pdf", size: "612 KB", offline: true,
        previewLines: [
          { text: "HAMARIKYU GARDENS", level: "h" },
          { text: "Visitor map", level: "m" },
          { text: "", level: "" },
          { text: "Nakajima-no-Ochaya tea house", level: "b" },
          { text: "Open 09:00 – 16:30 · last order 16:00", level: "b" },
          { text: "Matcha + wagashi · ¥850", level: "b" },
          { text: "", level: "" },
          { text: "Pamphlet from Tokyo Metropolitan Parks", level: "sm" },
        ],
      },
    ],
  },
  {
    id: "shibuya", time: "17:30", durMin: 90, end: "19:00",
    name: "Shibuya Sky", cat: "View", state: "next",
    where: "Shibuya Scramble Square · 46F",
    coords: { x: 0.55, y: 0.30 },
    travelTo: { mode: "Train", detail: "Toei Asakusa line", min: 18 },
    note: "Sunset slot 18:08. Free locker for bags. Helix outdoor deck closes if windy.",
  },
  {
    id: "saito", time: "20:00", durMin: 120, end: "22:00",
    name: "Sushi Saito", cat: "Dinner", state: "next",
    where: "Roppongi · ARK Hills",
    coords: { x: 0.66, y: 0.42 },
    travelTo: { mode: "Taxi", detail: "go straight, no detour", min: 15 },
    note: "Omakase ¥30,000pp. Card ok. Quiet room — phones off.",
    confirmation: { label: "Reservation", code: "SAITO-20260428-2P" },
    docs: [
      {
        id: "ss-1", name: "Sushi Saito — Reservation.pdf", kind: "pdf", size: "92 KB", offline: true,
        previewLines: [
          { text: "SUSHI SAITO", level: "h" },
          { text: "Reservation confirmation", level: "m" },
          { text: "", level: "" },
          { text: "Friday, April 28 · 20:00", level: "b" },
          { text: "2 guests · counter seating", level: "b" },
          { text: "Confirmation: SAITO-20260428-2P", level: "b" },
          { text: "", level: "" },
          { text: "Dress: smart casual. No fragrance.", level: "b" },
          { text: "Cancellation up to 48h before: free.", level: "b" },
          { text: "", level: "" },
          { text: "Roppongi 1-Chome · ARK Hills South Tower 1F", level: "sm" },
          { text: "+81 3-3589-4412 · Tabelog reservation #4412", level: "sm" },
        ],
      },
      {
        id: "ss-2", name: "Omakase menu — April.jpg", kind: "image", size: "1.4 MB", offline: true,
        previewLines: [
          { text: "OMAKASE · APRIL", level: "h" },
          { text: "Photographed menu card", level: "sm" },
        ],
      },
    ],
  },
];

export const FLEXIBLE: FlexibleEvent[] = [
  { id: "starbucks", name: "Starbucks Reserve · Nakameguro", cat: "Coffee", bucket: "morning", where: "4-min from station" },
  { id: "kiddyland", name: "Kiddy Land Harajuku", cat: "Shop", bucket: "afternoon", where: "If we have time before Shibuya" },
  { id: "goldengai", name: "Golden Gai walk-through", cat: "Drinks", bucket: "evening", where: "Optional after dinner" },
];
