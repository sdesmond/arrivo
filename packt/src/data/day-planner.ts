export type { EventState, TripEvent, TravelTo } from "./types";

import type { TripEvent } from "./types";

// Re-export typed aliases for consumers that still reference TimedEvent / FlexibleEvent.
export type TimedEvent = TripEvent;
export type FlexibleEvent = TripEvent;

export const TIMED: TripEvent[] = [
  {
    id: "tsukiji", time: "09:30", durMin: 90,
    name: "Tsukiji Outer Market", cat: "StreetFood", status: "done",
    location: { name: "Tsukiji · 4-chōme", mapPin: { x: 0.20, y: 0.36 } },
    note: "Brought cash. Got tamagoyaki + uni at Sushi Bun. Wait was 25 min.",
  },
  {
    id: "teamlab", time: "11:30", durMin: 120,
    name: "teamLab Planets", cat: "Museum", status: "done",
    location: { name: "Toyosu · timed entry", mapPin: { x: 0.34, y: 0.55 } },
    travelTo: { mode: "Subway", detail: "Yurakucho line", min: 12 },
    note: "Timed entry 11:30 confirmed in app. Bring shorts (water rooms).",
    confirmation: { label: "Order", code: "TLP-9F2K-7741" },
    docs: [
      {
        id: "tl-1", name: "teamLab Planets — 2 tickets.pdf",
        kind: "pdf", type: "tour-ticket", size: "184 KB", scope: "event", offline: true,
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
    id: "lunch", time: "13:45", durMin: 60,
    name: "Bills · Odaiba", cat: "Restaurant", status: "done",
    location: { name: "Odaiba · DiverCity", mapPin: { x: 0.42, y: 0.62 } },
    travelTo: { mode: "Walk", detail: "covered arcade", min: 8 },
  },
  {
    id: "hama", time: "15:00", durMin: 90,
    name: "Hamarikyu Gardens", cat: "Park", status: "now",
    location: { name: "Chuo · pond + tea house", mapPin: { x: 0.30, y: 0.43 } },
    travelTo: { mode: "Train", detail: "Yurikamome line", min: 14 },
    note: "Tea ceremony at 15:30 in Nakajima-no-Ochaya · ¥850. Reserve at entrance.",
    docs: [
      {
        id: "hm-1", name: "Garden map + tea house guide.pdf",
        kind: "pdf", type: "guide-pamphlet", size: "612 KB", scope: "event", offline: true,
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
    id: "shibuya", time: "17:30", durMin: 90,
    name: "Shibuya Sky", cat: "Viewpoint", status: "scheduled",
    location: { name: "Shibuya Scramble Square · 46F", mapPin: { x: 0.55, y: 0.30 } },
    travelTo: { mode: "Train", detail: "Toei Asakusa line", min: 18 },
    note: "Sunset slot 18:08. Free locker for bags. Helix outdoor deck closes if windy.",
  },
  {
    id: "saito", time: "20:00", durMin: 120,
    name: "Sushi Saito", cat: "Restaurant", status: "scheduled",
    location: { name: "Roppongi · ARK Hills", mapPin: { x: 0.66, y: 0.42 } },
    travelTo: { mode: "Taxi", detail: "go straight, no detour", min: 15 },
    note: "Omakase ¥30,000pp. Card ok. Quiet room — phones off.",
    confirmation: { label: "Reservation", code: "SAITO-20260428-2P" },
    docs: [
      {
        id: "ss-1", name: "Sushi Saito — Reservation.pdf",
        kind: "pdf", type: "restaurant-reservation", size: "92 KB", scope: "event", offline: true,
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
        id: "ss-2", name: "Omakase menu — April.jpg",
        kind: "image", type: "photo", size: "1.4 MB", scope: "event", offline: true,
        previewLines: [
          { text: "OMAKASE · APRIL", level: "h" },
          { text: "Photographed menu card", level: "sm" },
        ],
      },
    ],
  },
];

export const FLEXIBLE: TripEvent[] = [
  {
    id: "starbucks", name: "Starbucks Reserve · Nakameguro",
    cat: "Cafe", status: "scheduled", bucket: "morning",
    location: { name: "4-min from station" },
  },
  {
    id: "kiddyland", name: "Kiddy Land Harajuku",
    cat: "Shopping", status: "scheduled", bucket: "afternoon",
    location: { name: "If we have time before Shibuya" },
  },
  {
    id: "goldengai", name: "Golden Gai walk-through",
    cat: "Drinks", status: "scheduled", bucket: "evening",
    location: { name: "Optional after dinner" },
  },
];
