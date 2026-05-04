export type {
  DocPreviewLine,
  Document,
  Confirmation,
  TravelTo,
  TripEvent,
  DayItinerary,
  DocRailItem,
  PackingItem,
  Collaborator,
} from "./types";

import type {
  TripEvent,
  DayItinerary,
  DocRailItem,
  PackingItem,
  Collaborator,
} from "./types";

export const TOKYO_DAYS: DayItinerary[] = [
  {
    n: 1, label: "Mon · Apr 24", subtitle: "Arrival",
    events: [
      {
        id: "d1-nrt", time: "14:30", name: "Narita Airport (NRT)", cat: "Flight", status: "done",
        sub: "Terminal 2 · JL flight 0007",
        travelTo: { mode: "Train", detail: "Narita Express · 60 min" },
        confirmation: { label: "Booking", code: "JL-7H4K2P" },
        docs: [
          {
            id: "jl0007", name: "JL 0007 — Boarding pass.pdf",
            kind: "pdf", type: "flight-ticket", size: "124 KB", scope: "event", offline: true,
            previewLines: [
              { text: "JAPAN AIRLINES", level: "h" },
              { text: "Boarding pass · JL 0007", level: "m" },
              { text: "", level: "" },
              { text: "Maya Reyes · Economy", level: "b" },
              { text: "Seat 32K · Boarding 09:50", level: "b" },
              { text: "SFO → NRT · April 24", level: "b" },
              { text: "Booking ref: JL-7H4K2P", level: "b" },
              { text: "", level: "" },
              { text: "Gate posts 60 min before departure", level: "sm" },
            ],
          },
          {
            id: "nex-vchr", name: "Narita Express voucher.pdf",
            kind: "pdf", type: "transit-ticket", size: "88 KB", scope: "event", offline: true,
          },
        ],
      },
      {
        id: "d1-hyatt", time: "16:00", name: "Park Hyatt Tokyo", cat: "Hotel", status: "done",
        sub: "Check-in · Shinjuku", note: "Room block held until 18:00.",
        confirmation: { label: "Reservation", code: "HZ-49281" },
        docs: [
          {
            id: "hyatt-cf", name: "Park Hyatt — Confirmation.pdf",
            kind: "pdf", type: "hotel-confirmation", size: "156 KB", scope: "event", offline: true,
          },
        ],
      },
      {
        id: "d1-donjaca", time: "19:30", name: "Donjaca · izakaya", cat: "Restaurant", status: "done",
        sub: "Shinjuku · 6 min walk",
      },
    ],
  },
  {
    n: 2, label: "Tue · Apr 25", subtitle: "Old Tokyo",
    events: [
      {
        id: "d2-sensoji", time: "09:00", name: "Senso-ji Temple", cat: "HistoricSite", status: "done",
        sub: "Asakusa · arrive early to skip crowds",
      },
      {
        id: "d2-sometaro", time: "12:00", name: "Sometaro · okonomiyaki", cat: "Restaurant", status: "done",
        sub: "Asakusa", travelTo: { mode: "Walk", detail: "8 min" },
      },
      {
        id: "d2-ueno", time: "15:00", name: "Ueno Park · Tokyo Nat. Museum", cat: "Museum", status: "done",
        sub: "Free entry until 17:00",
      },
      {
        id: "d2-yakitori", time: "20:00", name: "Yakitori Toritsune", cat: "Restaurant", status: "done",
        sub: "Ueno · counter seating only",
      },
    ],
  },
  {
    n: 3, label: "Wed · Apr 26", subtitle: "West side",
    events: [
      {
        id: "d3-meiji", time: "10:30", name: "Meiji Jingu Shrine", cat: "HistoricSite", status: "done",
        sub: "Harajuku",
      },
      {
        id: "d3-afuri", time: "13:00", name: "Afuri Ramen · Harajuku", cat: "Restaurant", status: "done",
        sub: "Yuzu shio",
      },
      {
        id: "d3-catstreet", time: "15:30", name: "Cat Street + Omotesando", cat: "Tour", status: "done",
        sub: "Architecture loop",
      },
      {
        id: "d3-robot", time: "19:00", name: "Robot Restaurant alt show", cat: "Show", status: "done",
        sub: "Shinjuku · doors 18:30",
      },
    ],
  },
  {
    n: 4, label: "Thu · Apr 27", subtitle: "Day trip",
    events: [
      {
        id: "d4-hakone-train", time: "08:00", name: "Shinkansen → Hakone", cat: "Train", status: "done",
        sub: "Round-trip · Hakone Free Pass",
      },
      {
        id: "d4-museum", time: "11:00", name: "Hakone Open-Air Museum", cat: "Museum", status: "done",
        sub: "90 min recommended",
      },
      {
        id: "d4-ashi", time: "14:00", name: "Lake Ashi pirate ship", cat: "Cruise", status: "done",
        sub: "Mt Fuji visibility · clear today",
      },
      {
        id: "d4-return", time: "20:30", name: "Train back to Tokyo", cat: "Train", status: "done",
      },
    ],
  },
  {
    n: 5, label: "Fri · Apr 28", subtitle: "Today · Tokyo Bay", today: true,
    events: [
      {
        id: "d5-tsukiji", time: "09:30", name: "Tsukiji Outer Market", cat: "StreetFood", status: "done",
        sub: "Sushi breakfast at Sushi Bun", note: "Bring cash. Most stalls don't take cards.",
      },
      {
        id: "d5-teamlab", time: "11:30", name: "teamLab Planets", cat: "Museum", status: "done",
        sub: "Toyosu · timed entry 11:30",
        travelTo: { mode: "Subway", detail: "Yurakucho line · 12 min" },
        confirmation: { label: "Order", code: "TLP-9F2K-7741" },
        docs: [
          {
            id: "tl-tix", name: "teamLab Planets — 2 tickets.pdf",
            kind: "pdf", type: "tour-ticket", size: "184 KB", scope: "event", offline: true,
          },
        ],
      },
      {
        id: "d5-hama", time: "14:00", name: "Hamarikyu Gardens", cat: "Park", status: "now",
        sub: "Tea house in pond · 700¥", note: "Currently here. Tea ceremony at 15:00 if interested.",
        travelTo: { mode: "Walk", detail: "Yurikamome line · 14 min" },
        docs: [
          {
            id: "hm-map", name: "Garden map + tea house guide.pdf",
            kind: "pdf", type: "guide-pamphlet", size: "612 KB", scope: "event", offline: true,
          },
        ],
      },
      {
        id: "d5-shibuya", time: "17:30", name: "Shibuya Sky", cat: "Viewpoint", status: "scheduled",
        sub: "46th floor · sunset slot", travelTo: { mode: "Train", detail: "Toei Asakusa · 18 min" },
      },
      {
        id: "d5-saito", time: "20:00", name: "Sushi Saito", cat: "Restaurant", status: "scheduled",
        sub: "Roppongi · omakase ¥30,000pp", note: "Address sent to phone.",
        confirmation: { label: "Reservation", code: "SAITO-20260428-2P" },
        docs: [
          {
            id: "ss-rsv", name: "Sushi Saito — Reservation.pdf",
            kind: "pdf", type: "restaurant-reservation", size: "92 KB", scope: "event", offline: true,
          },
          {
            id: "ss-menu", name: "Omakase menu — April.jpg",
            kind: "image", type: "photo", size: "1.4 MB", scope: "event", offline: true,
          },
        ],
      },
    ],
  },
  {
    n: 6, label: "Sat · Apr 29", subtitle: "Shopping + nightlife",
    events: [
      {
        id: "d6-shimo", time: "10:00", name: "Shimokitazawa walk", cat: "Tour", status: "scheduled",
        sub: "Vintage + record shops loop",
      },
      {
        id: "d6-coco", time: "13:00", name: "CoCo Curry House", cat: "Restaurant", status: "scheduled",
      },
      {
        id: "d6-gyoen", time: "15:00", name: "Shinjuku Gyoen", cat: "Park", status: "scheduled",
        sub: "Late cherry blossoms",
      },
      {
        id: "d6-golden", time: "21:00", name: "Golden Gai bar crawl", cat: "Drinks", status: "scheduled",
        sub: "Kabukicho · cash only",
      },
    ],
  },
  {
    n: 7, label: "Sun · May 1", subtitle: "Departure",
    events: [
      {
        id: "d7-checkout", time: "11:00", name: "Park Hyatt · checkout", cat: "Hotel", status: "scheduled",
      },
      {
        id: "d7-nex", time: "13:30", name: "Narita Express → NRT", cat: "Train", status: "scheduled",
        travelTo: { mode: "Train", detail: "60 min" },
      },
      {
        id: "d7-flight", time: "17:50", name: "Flight JL 0006 to LAX", cat: "Flight", status: "scheduled",
        sub: "Terminal 2 · gate 33",
      },
    ],
  },
];

export const TOKYO_DOCS: DocRailItem[] = [
  { name: "JL 0007 boarding pass · arrival",  type: "flight-ticket",          cached: true  },
  { name: "Park Hyatt confirmation HZ-49281",  type: "hotel-confirmation",     cached: true  },
  { name: "Hakone Free Pass voucher",          type: "transit-ticket",         cached: true  },
  { name: "Sushi Saito reservation note",      type: "restaurant-reservation", cached: true  },
  { name: "JL 0006 boarding pass · departure", type: "flight-ticket",          cached: false },
  { name: "Travel insurance · Allianz",        type: "insurance",              cached: true  },
  { name: "JR Pass voucher",                   type: "transit-ticket",         cached: true  },
];

export const TOKYO_PACKING: PackingItem[] = [
  { name: "Passport",            done: true  },
  { name: "JR Pass voucher",     done: true  },
  { name: "Pasmo card",          done: true  },
  { name: "Universal adapter",   done: true  },
  { name: "Light rain shell",    done: true  },
  { name: "Walking shoes",       done: true  },
  { name: "Yen cash · ¥40,000", done: false },
  { name: "Pocket Wi-Fi pickup", done: false },
];

export const TOKYO_COLLAB: Collaborator[] = [
  {
    name: "Maya R.", email: "maya@packt.local", role: "owner", initials: "MR",
    tint: { bg: "oklch(0.86 0.05 8)", fg: "oklch(0.30 0.08 8)" },
  },
  {
    name: "Jules K.", email: "jules@packt.local", role: "editor", initials: "JK",
    tint: { bg: "oklch(0.86 0.05 200)", fg: "oklch(0.30 0.05 200)" },
  },
];

// Re-export a typed alias for consumers that still reference Place or TripDoc by name.
export type Place = TripEvent;
