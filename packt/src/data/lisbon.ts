import type { DayItinerary, Collaborator } from "./types";

export const LISBON_DAYS: DayItinerary[] = [
  {
    tripId: "lisbon-2026", dayNumber: 1, date: "2026-05-18", label: "Mon · May 18", subtitle: "Arrival",
    events: [
      {
        id: "l1-flight", time: "14:30", durationMinutes: 30,
        name: "TAP Air Portugal · TP 202", category:"Flight", status: "scheduled",
        subtitle: "Terminal 1 · JFK → LIS",
        location: { name: "Lisbon Airport · Terminal 1" },
        confirmationNumber: "TAP-KM9X3",
        travelTo: { mode: "Subway", detail: "Blue line → Marquês de Pombal", minutes:35 },
        docs: [
          {
            id: "tap-out", name: "TP 202 — Boarding pass.pdf",
            kind: "pdf", size: "118 KB", scope: "event", offline: true,
            previewLines: [
              { text: "TAP AIR PORTUGAL", level: "h" },
              { text: "Boarding pass · TP 202", level: "m" },
              { text: "", level: "" },
              { text: "Maya Reyes · Economy", level: "b" },
              { text: "Seat 24A · Boarding 13:00", level: "b" },
              { text: "JFK → LIS · May 18", level: "b" },
              { text: "Booking ref: TAP-KM9X3", level: "b" },
              { text: "", level: "" },
              { text: "Gate closes 30 min before departure", level: "sm" },
            ],
          },
        ],
      },
      {
        id: "l1-hotel", time: "16:30", durationMinutes: 30,
        name: "Bairro Alto Hotel", category:"Hotel", status: "scheduled",
        subtitle: "Check-in · Bairro Alto",
        location: { name: "Praça Luís de Camões · Bairro Alto" },
        confirmationNumber: "BAH-20260518",
        docs: [
          {
            id: "bah-cf", name: "Bairro Alto Hotel — Confirmation.pdf",
            kind: "pdf", size: "144 KB", scope: "event", offline: true,
            previewLines: [
              { text: "BAIRRO ALTO HOTEL", level: "h" },
              { text: "Reservation BAH-20260518", level: "m" },
              { text: "", level: "" },
              { text: "May 18 – 21 · 3 nights", level: "b" },
              { text: "Superior double · courtyard view", level: "b" },
              { text: "Breakfast included", level: "b" },
              { text: "", level: "" },
              { text: "Check-in from 15:00 · Check-out 12:00", level: "sm" },
            ],
          },
        ],
      },
      {
        id: "l1-dinner", time: "20:00", durationMinutes: 90,
        name: "Cervejaria Ramiro", category:"Restaurant", status: "scheduled",
        subtitle: "Seafood cervejaria · no reservations taken",
        note: "No reservations — arrive by 19:30 to avoid a long wait. Cash preferred.",
        location: { name: "Intendente · Av. Almirante Reis" },
        travelTo: { mode: "Taxi", minutes:12 },
      },
    ],
  },
  {
    tripId: "lisbon-2026", dayNumber: 2, date: "2026-05-19", label: "Tue · May 19", subtitle: "Belém + Alfama",
    events: [
      {
        id: "l2-belem", time: "09:30", durationMinutes: 45,
        name: "Pastéis de Belém", category:"Cafe", status: "scheduled",
        subtitle: "The original pastel de nata since 1837",
        location: { name: "Belém · Rua de Belém 84" },
        travelTo: { mode: "Bus", detail: "Tram 15E from Praça da Figueira", minutes:20 },
      },
      {
        id: "l2-jeronimos", time: "11:00", durationMinutes: 90,
        name: "Mosteiro dos Jerónimos", category:"HistoricSite", status: "scheduled",
        subtitle: "UNESCO · Manueline cloister",
        note: "Book tickets online — free Sunday mornings but crowds are brutal. Paid slot recommended.",
        location: { name: "Belém · Praça do Império" },
        travelTo: { mode: "Walk", minutes:5 },
      },
      {
        id: "l2-lxfactory", time: "14:00", durationMinutes: 90,
        name: "LX Factory", category:"Market", status: "scheduled",
        subtitle: "Independent shops + street food",
        location: { name: "Alcântara · Rua Rodrigues de Faria" },
        travelTo: { mode: "Walk", detail: "Along the river", minutes:12 },
      },
      {
        id: "l2-alfama", time: "17:30", durationMinutes: 90,
        name: "Alfama neighbourhood walk", category:"Tour", status: "scheduled",
        subtitle: "Miradouro da Graça · sunset views over the Tagus",
        location: { name: "Alfama · Miradouro da Graça" },
        travelTo: { mode: "Taxi", minutes:18 },
      },
      {
        id: "l2-fado", time: "20:30", durationMinutes: 120,
        name: "A Baiuca · fado house", category:"Restaurant", status: "scheduled",
        subtitle: "Traditional fado dinner — reservation pending",
        note: "Called twice, no answer. Will try again or walk-in. Tasca do Chico is the backup — same street.",
        location: { name: "Alfama · Rua de São Miguel" },
        travelTo: { mode: "Walk", minutes:5 },
      },
    ],
  },
  {
    tripId: "lisbon-2026", dayNumber: 3, date: "2026-05-20", label: "Wed · May 20", subtitle: "Sintra or Mouraria?",
    note: "Still deciding — Sintra needs an early start (7:30 train) or it's overrun by noon. Mouraria is the low-key alternative and probably more honest to how we actually travel. Both options below.",
    events: [
      {
        id: "l3-sintra-train", time: "07:45", durationMinutes: 40,
        name: "CP train → Sintra", category:"Train", status: "scheduled",
        subtitle: "Option A · Rossio → Sintra every 30 min, no booking needed",
        note: "Buy combined Sintra Vila + Pena + Moorish Castle ticket at the station (€31).",
        location: { name: "Rossio Station → Sintra" },
        priority: "flexible",
      },
      {
        id: "l3-pena", time: "10:00", durationMinutes: 90,
        name: "Palácio Nacional da Pena", category:"HistoricSite", status: "scheduled",
        subtitle: "Hilltop palace · timed entry — book in advance",
        note: "Book online before we leave — sells out by the night before.",
        location: { name: "Sintra · Pena Palace" },
        priority: "flexible",
      },
      {
        id: "l3-sintra-lunch", time: "13:00", durationMinutes: 60,
        name: "Lunch in Sintra vila", category:"Restaurant", status: "scheduled",
        subtitle: "Tasca do Tio Gaetano or similar",
        priority: "flexible",
      },
      {
        id: "l3-mouraria",
        name: "Mouraria walk + Intendente square", category:"Tour", status: "scheduled",
        subtitle: "Option B · the real neighbourhood Lisbon",
        bucket: "morning",
        priority: "flexible",
      },
      {
        id: "l3-principe", category:"Shopping", status: "scheduled",
        name: "Príncipe Real market + antique shops",
        subtitle: "Option B · weekend market, great for ceramics",
        bucket: "afternoon",
        priority: "flexible",
      },
      {
        id: "l3-ginjinha", category:"Drinks", status: "scheduled",
        name: "Ginjinha shot at A Ginjinha", subtitle: "Rossio · cherry liqueur · €1.50 standing",
        bucket: "evening",
        location: { name: "Rossio square · Largo São Domingos" },
      },
    ],
  },
  {
    tripId: "lisbon-2026", dayNumber: 4, date: "2026-05-21", label: "Thu · May 21", subtitle: "Last morning + departure",
    note: "Flight is 17:55 so we have until early afternoon. Checkout at noon.",
    events: [
      {
        id: "l4-breakfast", category:"Cafe", status: "scheduled",
        name: "Slow breakfast near hotel", subtitle: "A Cevicheria or just the hotel terrace",
        bucket: "morning",
      },
      {
        id: "l4-checkout", time: "12:00", durationMinutes: 30,
        name: "Bairro Alto Hotel · checkout", category:"Hotel", status: "scheduled",
        location: { name: "Praça Luís de Camões · Bairro Alto" },
      },
      {
        id: "l4-market", time: "12:30", durationMinutes: 60,
        name: "Time Out Market Lisboa", category:"Restaurant", status: "scheduled",
        subtitle: "Last lunch · food hall by Cais do Sodré",
        location: { name: "Cais do Sodré · Av. 24 de Julho" },
        travelTo: { mode: "Walk", detail: "Along riverfront", minutes:8 },
      },
      {
        id: "l4-flight", time: "17:55", durationMinutes: 30,
        name: "TAP Air Portugal · TP 203", category:"Flight", status: "scheduled",
        subtitle: "LIS → JFK · Terminal 1",
        location: { name: "Lisbon Airport · Terminal 1" },
        confirmationNumber: "TAP-KM9X3",
        travelTo: { mode: "Subway", detail: "Blue line → Aeroporto · depart by 15:15", minutes:35 },
        docs: [
          {
            id: "tap-ret", name: "TP 203 — Boarding pass.pdf",
            kind: "pdf", size: "118 KB", scope: "event", offline: false,
            previewLines: [
              { text: "TAP AIR PORTUGAL", level: "h" },
              { text: "Boarding pass · TP 203", level: "m" },
              { text: "", level: "" },
              { text: "Maya Reyes · Economy", level: "b" },
              { text: "LIS → JFK · May 21", level: "b" },
              { text: "Booking ref: TAP-KM9X3", level: "b" },
            ],
          },
        ],
      },
    ],
  },
];

export const LISBON_DOCS = [
  { name: "TP 202 — Outbound boarding pass",    subtitle: "Flight ticket",      cached: true  },
  { name: "Bairro Alto Hotel — BAH-20260518",   subtitle: "Hotel confirmation", cached: true  },
  { name: "TP 203 — Return boarding pass",       subtitle: "Flight ticket",      cached: false },
  { name: "Travel insurance · AXA",             subtitle: "Insurance",          cached: true  },
];

export const LISBON_COLLAB: Collaborator[] = [
  {
    name: "Maya R.", email: "maya@packt.local", role: "owner", initials: "MR",
    tint: { bg: "oklch(0.86 0.05 8)", fg: "oklch(0.30 0.08 8)" },
  },
  {
    name: "Alex C.", email: "alex@packt.local", role: "editor", initials: "AC",
    tint: { bg: "oklch(0.86 0.06 45)", fg: "oklch(0.30 0.10 45)" },
  },
];
