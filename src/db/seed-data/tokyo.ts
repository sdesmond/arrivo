export type {
  DocPreviewLine,
  Document,
  TripEvent,
  DayItinerary,
  PackingItem,
  Collaborator,
} from "../../data/types";

import type {
  TripEvent,
  DayItinerary,
  PackingItem,
  Collaborator,
} from "../../data/types";

export const TOKYO_DAYS: DayItinerary[] = [
  {
    tripId: "tokyo-2026", dayNumber:1, date: "2026-04-24", label: "Mon · Apr 24", subtitle: "Arrival",
    events: [
      {
        id: "d1-nrt", time: "14:30", endTime: "15:00",
        name: "Narita Airport (NRT)",
        location: { name: "Narita Airport · Terminal 2" },
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
        id: "d1-hyatt", time: "16:00", endTime: "17:00",
        name: "Park Hyatt Tokyo",
        note: "Room block held until 18:00.",
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
        id: "d1-donjaca", time: "19:30", endTime: "21:00",
        name: "Donjaca · izakaya",
        location: { name: "Shinjuku · 6 min from hotel" },
      },
    ],
  },
  {
    tripId: "tokyo-2026", dayNumber:2, date: "2026-04-25", label: "Tue · Apr 25", subtitle: "Old Tokyo",
    events: [
      {
        id: "d2-sensoji", time: "09:00", endTime: "10:30",
        name: "Senso-ji Temple",
        location: { name: "Asakusa · Senso-ji" },
      },
      {
        id: "d2-sometaro", time: "12:00", endTime: "13:15",
        name: "Sometaro · okonomiyaki",
        location: { name: "Asakusa" },
      },
      {
        id: "d2-ueno", time: "15:00", endTime: "17:00",
        name: "Ueno Park · Tokyo Nat. Museum",
        location: { name: "Ueno · Tokyo National Museum" },
      },
      {
        id: "d2-yakitori", time: "20:00", endTime: "21:30",
        name: "Yakitori Toritsune",
        location: { name: "Ueno" },
      },
    ],
  },
  {
    tripId: "tokyo-2026", dayNumber:3, date: "2026-04-26", label: "Wed · Apr 26", subtitle: "West side",
    events: [
      {
        id: "d3-meiji", time: "10:30", endTime: "11:30",
        name: "Meiji Jingu Shrine",
        location: { name: "Harajuku · Meiji Jingu" },
      },
      {
        id: "d3-afuri", time: "13:00", endTime: "14:00",
        name: "Afuri Ramen · Harajuku",
        location: { name: "Harajuku" },
      },
      {
        id: "d3-catstreet", time: "15:30", endTime: "17:00",
        name: "Cat Street + Omotesando",
        location: { name: "Omotesando" },
      },
      {
        id: "d3-robot", time: "19:00", endTime: "21:00",
        name: "Robot Restaurant alt show",
        location: { name: "Shinjuku Kabukicho" },
      },
    ],
  },
  {
    tripId: "tokyo-2026", dayNumber:4, date: "2026-04-27", label: "Thu · Apr 27", subtitle: "Day trip",
    events: [
      {
        id: "d4-hakone-train", time: "08:00", endTime: "09:30",
        name: "Shinkansen → Hakone",
        location: { name: "Shinjuku Station → Odawara" },
      },
      {
        id: "d4-museum", time: "11:00", endTime: "12:30",
        name: "Hakone Open-Air Museum",
        location: { name: "Hakone · Open-Air Museum" },
      },
      {
        id: "d4-ashi", time: "14:00", endTime: "15:00",
        name: "Lake Ashi pirate ship",
        location: { name: "Lake Ashi · Togendai" },
      },
      {
        id: "d4-return", time: "20:30", endTime: "22:00",
        name: "Train back to Tokyo",
        location: { name: "Odawara → Shinjuku" },
      },
    ],
  },
  {
    tripId: "tokyo-2026", dayNumber:5, date: "2026-04-28", label: "Fri · Apr 28", subtitle: "Today · Tokyo Bay", today: true,
    weather: "22° · partly cloudy",
    travelSummary: "~14 km · 1h 5m",
    events: [
      {
        id: "d5-tsukiji", time: "09:30", endTime: "11:00",
        name: "Tsukiji Outer Market",
        note: "Brought cash. Got tamagoyaki + uni at Sushi Bun. Wait was 25 min.",
        location: { name: "Tsukiji · 4-chōme" },
      },
      {
        id: "d5-teamlab", time: "11:30", endTime: "13:30",
        name: "teamLab Planets",
        note: "Timed entry 11:30 confirmed in app. Bring shorts (water rooms).",
        location: { name: "Toyosu · timed entry" },
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
        id: "d5-bills", time: "13:45", endTime: "14:45",
        name: "Bills · Odaiba",
        location: { name: "Odaiba · DiverCity" },
      },
      {
        id: "d5-hama", time: "15:00", endTime: "16:30",
        name: "Hamarikyu Gardens",
        note: "Tea ceremony at 15:30 in Nakajima-no-Ochaya · ¥850. Reserve at entrance.",
        location: { name: "Chuo · pond + tea house" },
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
        id: "d5-shibuya", time: "17:30", endTime: "19:00",
        name: "Shibuya Sky",
        note: "Sunset slot 18:08. Free locker for bags. Helix outdoor deck closes if windy.",
        location: { name: "Shibuya Scramble Square · 46F" },
      },
      {
        id: "d5-saito", time: "20:00", endTime: "22:00",
        name: "Sushi Saito",
        note: "Omakase ¥30,000pp. Card ok. Quiet room — phones off. Address sent to phone.",
        location: { name: "Roppongi · ARK Hills" },
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
      {
        id: "d5-starbucks", name: "Starbucks Reserve · Nakameguro",
        location: { name: "4-min from station" },
      },
      {
        id: "d5-kiddyland", name: "Kiddy Land Harajuku",
        location: { name: "If we have time before Shibuya" },
      },
      {
        id: "d5-goldengai", name: "Golden Gai walk-through",
        location: { name: "Optional after dinner" },
      },
    ],
  },
  {
    tripId: "tokyo-2026", dayNumber:6, date: "2026-04-29", label: "Sat · Apr 29", subtitle: "Shopping + nightlife",
    events: [
      {
        id: "d6-shimo", time: "10:00", endTime: "12:00",
        name: "Shimokitazawa walk",
        location: { name: "Shimokitazawa" },
      },
      {
        id: "d6-coco", time: "13:00", endTime: "14:00",
        name: "CoCo Curry House",
        location: { name: "Shimokitazawa" },
      },
      {
        id: "d6-gyoen", time: "15:00", endTime: "16:30",
        name: "Shinjuku Gyoen",
        location: { name: "Shinjuku Gyoen" },
      },
      {
        id: "d6-golden", time: "21:00", endTime: "23:00",
        name: "Golden Gai bar crawl",
        location: { name: "Shinjuku Kabukicho · Golden Gai" },
      },
    ],
  },
  {
    tripId: "tokyo-2026", dayNumber:7, date: "2026-05-01", label: "Sun · May 1", subtitle: "Departure",
    events: [
      {
        id: "d7-checkout", time: "11:00", endTime: "11:45",
        name: "Park Hyatt · checkout",
        location: { name: "Shinjuku · Park Hyatt" },
      },
      {
        id: "d7-nex", time: "13:30", endTime: "14:30",
        name: "Narita Express → NRT",
        location: { name: "Shinjuku Station → NRT Terminal 2" },
      },
      {
        id: "d7-flight", time: "17:50", endTime: "18:20",
        name: "Flight JL 0006 to LAX",
        location: { name: "Narita Airport · Terminal 2 · Gate 33" },
      },
    ],
  },
];

export const TOKYO_DOCS = [
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

export type Place = TripEvent;
