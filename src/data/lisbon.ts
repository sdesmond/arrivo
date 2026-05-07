import type { DayItinerary, Collaborator } from "./types";

export const LISBON_DAYS: DayItinerary[] = [
  {
    tripId: "lisbon-2026", dayNumber: 1, date: "2026-05-18", label: "Mon · May 18", subtitle: "Arrival",
    events: [
      {
        id: "l1-flight", time: "14:30", endTime: "15:00",
        name: "TAP Air Portugal · TP 202",
        location: { name: "Lisbon Airport · Terminal 1" },
        confirmationNumber: "TAP-KM9X3",
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
        id: "l1-hotel", time: "16:30", endTime: "17:00",
        name: "Bairro Alto Hotel",
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
        id: "l1-dinner", time: "20:00", endTime: "21:30",
        name: "Cervejaria Ramiro",
        note: "No reservations — arrive by 19:30 to avoid a long wait. Cash preferred.",
        location: { name: "Intendente · Av. Almirante Reis" },
      },
    ],
  },
  {
    tripId: "lisbon-2026", dayNumber: 2, date: "2026-05-19", label: "Tue · May 19", subtitle: "Belém + Alfama",
    events: [
      {
        id: "l2-belem", time: "09:30", endTime: "10:15",
        name: "Pastéis de Belém",
        location: { name: "Belém · Rua de Belém 84" },
      },
      {
        id: "l2-jeronimos", time: "11:00", endTime: "12:30",
        name: "Mosteiro dos Jerónimos",
        note: "Book tickets online — free Sunday mornings but crowds are brutal. Paid slot recommended.",
        location: { name: "Belém · Praça do Império" },
      },
      {
        id: "l2-lxfactory", time: "14:00", endTime: "15:30",
        name: "LX Factory",
        location: { name: "Alcântara · Rua Rodrigues de Faria" },
      },
      {
        id: "l2-alfama", time: "17:30", endTime: "19:00",
        name: "Alfama neighbourhood walk",
        location: { name: "Alfama · Miradouro da Graça" },
      },
      {
        id: "l2-fado", time: "20:30", endTime: "22:30",
        name: "A Baiuca · fado house",
        note: "Called twice, no answer. Will try again or walk-in. Tasca do Chico is the backup — same street.",
        location: { name: "Alfama · Rua de São Miguel" },
      },
    ],
  },
  {
    tripId: "lisbon-2026", dayNumber: 3, date: "2026-05-20", label: "Wed · May 20", subtitle: "Sintra or Mouraria?",
    events: [
      {
        id: "l3-sintra-train", time: "07:45", endTime: "08:25",
        name: "CP train → Sintra",
        note: "Buy combined Sintra Vila + Pena + Moorish Castle ticket at the station (€31).",
        location: { name: "Rossio Station → Sintra" },
      },
      {
        id: "l3-pena", time: "10:00", endTime: "11:30",
        name: "Palácio Nacional da Pena",
        note: "Book online before we leave — sells out by the night before.",
        location: { name: "Sintra · Pena Palace" },
      },
      {
        id: "l3-sintra-lunch", time: "13:00", endTime: "14:00",
        name: "Lunch in Sintra vila",
      },
      {
        id: "l3-mouraria",
        name: "Mouraria walk + Intendente square",
      },
      {
        id: "l3-principe",
        name: "Príncipe Real market + antique shops",
      },
      {
        id: "l3-ginjinha",
        name: "Ginjinha shot at A Ginjinha",
        location: { name: "Rossio square · Largo São Domingos" },
      },
    ],
  },
  {
    tripId: "lisbon-2026", dayNumber: 4, date: "2026-05-21", label: "Thu · May 21", subtitle: "Last morning + departure",
    events: [
      {
        id: "l4-breakfast",
        name: "Slow breakfast near hotel",
      },
      {
        id: "l4-checkout", time: "12:00", endTime: "12:30",
        name: "Bairro Alto Hotel · checkout",
        location: { name: "Praça Luís de Camões · Bairro Alto" },
      },
      {
        id: "l4-market", time: "12:30", endTime: "13:30",
        name: "Time Out Market Lisboa",
        location: { name: "Cais do Sodré · Av. 24 de Julho" },
      },
      {
        id: "l4-flight", time: "17:55", endTime: "18:25",
        name: "TAP Air Portugal · TP 203",
        location: { name: "Lisbon Airport · Terminal 1" },
        confirmationNumber: "TAP-KM9X3",
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
