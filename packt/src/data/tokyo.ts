export type {
  DocPreviewLine,
  Document,
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
    tripId: "tokyo-2026", n: 1, date: "2026-04-24", label: "Mon · Apr 24", subtitle: "Arrival",
    events: [
      {
        id: "d1-nrt", time: "14:30", durMin: 30,
        name: "Narita Airport (NRT)", cat: "Flight", status: "done",
        sub: "Terminal 2 · JL flight 0007",
        location: { name: "Narita Airport · Terminal 2" },
        travelTo: { mode: "Train", detail: "Narita Express", min: 60 },
        confirmationNumber: "JL-7H4K2P",
        docs: [
          {
            id: "jl0007", name: "JL 0007 — Boarding pass.pdf",
            kind: "pdf", size: "124 KB", scope: "event", offline: true,
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
            kind: "pdf", size: "88 KB", scope: "event", offline: true,
          },
        ],
      },
      {
        id: "d1-hyatt", time: "16:00", durMin: 60,
        name: "Park Hyatt Tokyo", cat: "Hotel", status: "done",
        sub: "Check-in · Shinjuku", note: "Room block held until 18:00.",
        location: { name: "Shinjuku · Park Hyatt" },
        confirmationNumber: "HZ-49281",
        docs: [
          {
            id: "hyatt-cf", name: "Park Hyatt — Confirmation.pdf",
            kind: "pdf", size: "156 KB", scope: "event", offline: true,
          },
        ],
      },
      {
        id: "d1-donjaca", time: "19:30", durMin: 90,
        name: "Donjaca · izakaya", cat: "Restaurant", status: "done",
        sub: "Shinjuku · 6 min walk",
        location: { name: "Shinjuku · 6 min from hotel" },
        travelTo: { mode: "Walk", min: 6 },
      },
    ],
  },
  {
    tripId: "tokyo-2026", n: 2, date: "2026-04-25", label: "Tue · Apr 25", subtitle: "Old Tokyo",
    events: [
      {
        id: "d2-sensoji", time: "09:00", durMin: 90,
        name: "Senso-ji Temple", cat: "HistoricSite", status: "done",
        sub: "Asakusa · arrive early to skip crowds",
        location: { name: "Asakusa · Senso-ji" },
      },
      {
        id: "d2-sometaro", time: "12:00", durMin: 75,
        name: "Sometaro · okonomiyaki", cat: "Restaurant", status: "done",
        sub: "Asakusa",
        location: { name: "Asakusa" },
        travelTo: { mode: "Walk", min: 8 },
      },
      {
        id: "d2-ueno", time: "15:00", durMin: 120,
        name: "Ueno Park · Tokyo Nat. Museum", cat: "Museum", status: "done",
        sub: "Free entry until 17:00",
        location: { name: "Ueno · Tokyo National Museum" },
        travelTo: { mode: "Subway", detail: "Ginza line", min: 10 },
      },
      {
        id: "d2-yakitori", time: "20:00", durMin: 90,
        name: "Yakitori Toritsune", cat: "Restaurant", status: "done",
        sub: "Ueno · counter seating only",
        location: { name: "Ueno" },
        travelTo: { mode: "Walk", min: 5 },
      },
    ],
  },
  {
    tripId: "tokyo-2026", n: 3, date: "2026-04-26", label: "Wed · Apr 26", subtitle: "West side",
    events: [
      {
        id: "d3-meiji", time: "10:30", durMin: 60,
        name: "Meiji Jingu Shrine", cat: "HistoricSite", status: "done",
        sub: "Harajuku",
        location: { name: "Harajuku · Meiji Jingu" },
      },
      {
        id: "d3-afuri", time: "13:00", durMin: 60,
        name: "Afuri Ramen · Harajuku", cat: "Restaurant", status: "done",
        sub: "Yuzu shio",
        location: { name: "Harajuku" },
        travelTo: { mode: "Walk", min: 12 },
      },
      {
        id: "d3-catstreet", time: "15:30", durMin: 90,
        name: "Cat Street + Omotesando", cat: "Tour", status: "done",
        sub: "Architecture loop",
        location: { name: "Omotesando" },
        travelTo: { mode: "Walk", min: 5 },
      },
      {
        id: "d3-robot", time: "19:00", durMin: 120,
        name: "Robot Restaurant alt show", cat: "Show", status: "done",
        sub: "Shinjuku · doors 18:30",
        location: { name: "Shinjuku Kabukicho" },
        travelTo: { mode: "Subway", detail: "Yamanote line", min: 15 },
      },
    ],
  },
  {
    tripId: "tokyo-2026", n: 4, date: "2026-04-27", label: "Thu · Apr 27", subtitle: "Day trip",
    events: [
      {
        id: "d4-hakone-train", time: "08:00", durMin: 90,
        name: "Shinkansen → Hakone", cat: "Train", status: "done",
        sub: "Round-trip · Hakone Free Pass",
        location: { name: "Shinjuku Station → Odawara" },
      },
      {
        id: "d4-museum", time: "11:00", durMin: 90,
        name: "Hakone Open-Air Museum", cat: "Museum", status: "done",
        sub: "90 min recommended",
        location: { name: "Hakone · Open-Air Museum" },
        travelTo: { mode: "Train", detail: "Hakone Tozan Railway", min: 15 },
      },
      {
        id: "d4-ashi", time: "14:00", durMin: 60,
        name: "Lake Ashi pirate ship", cat: "Cruise", status: "done",
        sub: "Mt Fuji visibility · clear today",
        location: { name: "Lake Ashi · Togendai" },
        travelTo: { mode: "Bus", detail: "Hakone Tozan Bus", min: 20 },
      },
      {
        id: "d4-return", time: "20:30", durMin: 90,
        name: "Train back to Tokyo", cat: "Train", status: "done",
        location: { name: "Odawara → Shinjuku" },
      },
    ],
  },
  {
    tripId: "tokyo-2026", n: 5, date: "2026-04-28", label: "Fri · Apr 28", subtitle: "Today · Tokyo Bay", today: true,
    events: [
      {
        id: "d5-tsukiji", time: "09:30", durMin: 90,
        name: "Tsukiji Outer Market", cat: "StreetFood", status: "done",
        sub: "Sushi breakfast at Sushi Bun",
        note: "Brought cash. Got tamagoyaki + uni at Sushi Bun. Wait was 25 min.",
        location: { name: "Tsukiji · 4-chōme" },
      },
      {
        id: "d5-teamlab", time: "11:30", durMin: 120,
        name: "teamLab Planets", cat: "Museum", status: "done",
        sub: "Toyosu · timed entry 11:30",
        note: "Timed entry 11:30 confirmed in app. Bring shorts (water rooms).",
        location: { name: "Toyosu · timed entry" },
        travelTo: { mode: "Subway", detail: "Yurakucho line", min: 12 },
        confirmationNumber: "TLP-9F2K-7741",
        docs: [
          {
            id: "tl-tix", name: "teamLab Planets — 2 tickets.pdf",
            kind: "pdf", size: "184 KB", scope: "event", offline: true,
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
        id: "d5-bills", time: "13:45", durMin: 60,
        name: "Bills · Odaiba", cat: "Restaurant", status: "done",
        location: { name: "Odaiba · DiverCity" },
        travelTo: { mode: "Walk", detail: "covered arcade", min: 8 },
      },
      {
        id: "d5-hama", time: "15:00", durMin: 90,
        name: "Hamarikyu Gardens", cat: "Park", status: "scheduled",
        sub: "Tea house in pond · 700¥",
        note: "Tea ceremony at 15:30 in Nakajima-no-Ochaya · ¥850. Reserve at entrance.",
        location: { name: "Chuo · pond + tea house" },
        travelTo: { mode: "Train", detail: "Yurikamome line", min: 14 },
        docs: [
          {
            id: "hm-map", name: "Garden map + tea house guide.pdf",
            kind: "pdf", size: "612 KB", scope: "event", offline: true,
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
        id: "d5-shibuya", time: "17:30", durMin: 90,
        name: "Shibuya Sky", cat: "Viewpoint", status: "scheduled",
        sub: "46th floor · sunset slot",
        note: "Sunset slot 18:08. Free locker for bags. Helix outdoor deck closes if windy.",
        location: { name: "Shibuya Scramble Square · 46F" },
        travelTo: { mode: "Train", detail: "Toei Asakusa line", min: 18 },
      },
      {
        id: "d5-saito", time: "20:00", durMin: 120,
        name: "Sushi Saito", cat: "Restaurant", status: "scheduled",
        sub: "Roppongi · omakase ¥30,000pp",
        note: "Omakase ¥30,000pp. Card ok. Quiet room — phones off. Address sent to phone.",
        location: { name: "Roppongi · ARK Hills" },
        travelTo: { mode: "Taxi", detail: "go straight, no detour", min: 15 },
        confirmationNumber: "SAITO-20260428-2P",
        docs: [
          {
            id: "ss-rsv", name: "Sushi Saito — Reservation.pdf",
            kind: "pdf", size: "92 KB", scope: "event", offline: true,
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
            id: "ss-menu", name: "Omakase menu — April.jpg",
            kind: "image", size: "1.4 MB", scope: "event", offline: true,
            previewLines: [
              { text: "OMAKASE · APRIL", level: "h" },
              { text: "Photographed menu card", level: "sm" },
            ],
          },
        ],
      },
      // Flexible (bucket-based) events for the day
      {
        id: "d5-starbucks", name: "Starbucks Reserve · Nakameguro",
        cat: "Cafe", status: "scheduled", bucket: "morning",
        location: { name: "4-min from station" },
      },
      {
        id: "d5-kiddyland", name: "Kiddy Land Harajuku",
        cat: "Shopping", status: "scheduled", bucket: "afternoon",
        location: { name: "If we have time before Shibuya" },
      },
      {
        id: "d5-goldengai", name: "Golden Gai walk-through",
        cat: "Drinks", status: "scheduled", bucket: "evening",
        location: { name: "Optional after dinner" },
      },
    ],
  },
  {
    tripId: "tokyo-2026", n: 6, date: "2026-04-29", label: "Sat · Apr 29", subtitle: "Shopping + nightlife",
    events: [
      {
        id: "d6-shimo", time: "10:00", durMin: 120,
        name: "Shimokitazawa walk", cat: "Tour", status: "scheduled",
        sub: "Vintage + record shops loop",
        location: { name: "Shimokitazawa" },
      },
      {
        id: "d6-coco", time: "13:00", durMin: 60,
        name: "CoCo Curry House", cat: "Restaurant", status: "scheduled",
        location: { name: "Shimokitazawa" },
        travelTo: { mode: "Walk", min: 3 },
      },
      {
        id: "d6-gyoen", time: "15:00", durMin: 90,
        name: "Shinjuku Gyoen", cat: "Park", status: "scheduled",
        sub: "Late cherry blossoms",
        location: { name: "Shinjuku Gyoen" },
        travelTo: { mode: "Subway", detail: "Odakyu line", min: 20 },
      },
      {
        id: "d6-golden", time: "21:00", durMin: 120,
        name: "Golden Gai bar crawl", cat: "Drinks", status: "scheduled",
        sub: "Kabukicho · cash only",
        location: { name: "Shinjuku Kabukicho · Golden Gai" },
        travelTo: { mode: "Walk", min: 10 },
      },
    ],
  },
  {
    tripId: "tokyo-2026", n: 7, date: "2026-05-01", label: "Sun · May 1", subtitle: "Departure",
    events: [
      {
        id: "d7-checkout", time: "11:00", durMin: 45,
        name: "Park Hyatt · checkout", cat: "Hotel", status: "scheduled",
        location: { name: "Shinjuku · Park Hyatt" },
      },
      {
        id: "d7-nex", time: "13:30", durMin: 60,
        name: "Narita Express → NRT", cat: "Train", status: "scheduled",
        location: { name: "Shinjuku Station → NRT Terminal 2" },
        travelTo: { mode: "Train", detail: "Narita Express", min: 60 },
      },
      {
        id: "d7-flight", time: "17:50", durMin: 30,
        name: "Flight JL 0006 to LAX", cat: "Flight", status: "scheduled",
        sub: "Terminal 2 · gate 33",
        location: { name: "Narita Airport · Terminal 2 · Gate 33" },
      },
    ],
  },
];

export const TOKYO_DOCS: DocRailItem[] = [
  { name: "JL 0007 boarding pass · arrival",  subtitle: "Flight ticket",          cached: true  },
  { name: "Park Hyatt confirmation HZ-49281",  subtitle: "Hotel confirmation",     cached: true  },
  { name: "Hakone Free Pass voucher",          subtitle: "Transit ticket",         cached: true  },
  { name: "Sushi Saito reservation note",      subtitle: "Restaurant reservation", cached: true  },
  { name: "JL 0006 boarding pass · departure", subtitle: "Flight ticket",          cached: false },
  { name: "Travel insurance · Allianz",        subtitle: "Insurance",              cached: true  },
  { name: "JR Pass voucher",                   subtitle: "Transit ticket",         cached: true  },
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

// Re-export a typed alias for consumers that still reference Place by name.
export type Place = TripEvent;
