export type PlaceState = "done" | "now" | "next";

export interface DocPreviewLine {
  text: string;
  level: "h" | "m" | "b" | "sm" | "";
}

export interface TripDoc {
  id: string;
  name: string;
  kind: "pdf" | "image" | "doc";
  size: string;
  offline: boolean;
  previewLines?: DocPreviewLine[];
}

export interface Confirmation {
  label: string;
  code: string;
}

export interface TravelLink {
  mode: string;
  detail: string;
}

export interface Place {
  id?: string;
  time: string;
  name: string;
  cat: string;
  state: PlaceState;
  sub?: string;
  note?: string;
  confirmation?: Confirmation;
  docs?: TripDoc[];
  travel?: TravelLink;
}

export interface DayItinerary {
  n: number;
  label: string;
  subtitle: string;
  today?: boolean;
  places: Place[];
}

export interface DocRailItem {
  name: string;
  type: string;
  cached: boolean;
}

export interface PackingItem {
  n: string;
  done: boolean;
}

export interface Collaborator {
  n: string;
  e: string;
  role: string;
  i: string;
  tint: { bg: string; fg: string };
}

export const TOKYO_DAYS: DayItinerary[] = [
  {
    n: 1, label: "Mon · Apr 24", subtitle: "Arrival",
    places: [
      {
        id: "d1-nrt", time: "14:30", name: "Narita Airport (NRT)", cat: "Arrival", state: "done",
        sub: "Terminal 2 · JL flight 0007",
        travel: { mode: "Train", detail: "Narita Express · 60 min" },
        confirmation: { label: "Booking", code: "JL-7H4K2P" },
        docs: [
          { id: "jl0007", name: "JL 0007 — Boarding pass.pdf", kind: "pdf", size: "124 KB", offline: true,
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
          { id: "nex-vchr", name: "Narita Express voucher.pdf", kind: "pdf", size: "88 KB", offline: true },
        ],
      },
      {
        id: "d1-hyatt", time: "16:00", name: "Park Hyatt Tokyo", cat: "Hotel", state: "done",
        sub: "Check-in · Shinjuku", note: "Room block held until 18:00.",
        confirmation: { label: "Reservation", code: "HZ-49281" },
        docs: [
          { id: "hyatt-cf", name: "Park Hyatt — Confirmation.pdf", kind: "pdf", size: "156 KB", offline: true },
        ],
      },
      { id: "d1-donjaca", time: "19:30", name: "Donjaca · izakaya", cat: "Dinner", state: "done", sub: "Shinjuku · 6 min walk" },
    ],
  },
  {
    n: 2, label: "Tue · Apr 25", subtitle: "Old Tokyo",
    places: [
      { time: "09:00", name: "Senso-ji Temple", cat: "Culture", state: "done", sub: "Asakusa · arrive early to skip crowds" },
      { time: "12:00", name: "Sometaro · okonomiyaki", cat: "Lunch", state: "done", sub: "Asakusa", travel: { mode: "Walk", detail: "8 min" } },
      { time: "15:00", name: "Ueno Park · Tokyo Nat. Museum", cat: "Museum", state: "done", sub: "Free entry until 17:00" },
      { time: "20:00", name: "Yakitori Toritsune", cat: "Dinner", state: "done", sub: "Ueno · counter seating only" },
    ],
  },
  {
    n: 3, label: "Wed · Apr 26", subtitle: "West side",
    places: [
      { time: "10:30", name: "Meiji Jingu Shrine", cat: "Culture", state: "done", sub: "Harajuku" },
      { time: "13:00", name: "Afuri Ramen · Harajuku", cat: "Lunch", state: "done", sub: "Yuzu shio" },
      { time: "15:30", name: "Cat Street + Omotesando", cat: "Walk", state: "done", sub: "Architecture loop" },
      { time: "19:00", name: "Robot Restaurant alt show", cat: "Show", state: "done", sub: "Shinjuku · doors 18:30" },
    ],
  },
  {
    n: 4, label: "Thu · Apr 27", subtitle: "Day trip",
    places: [
      { time: "08:00", name: "Shinkansen → Hakone", cat: "Transit", state: "done", sub: "Round-trip · Hakone Free Pass" },
      { time: "11:00", name: "Hakone Open-Air Museum", cat: "Museum", state: "done", sub: "90 min recommended" },
      { time: "14:00", name: "Lake Ashi pirate ship", cat: "Boat", state: "done", sub: "Mt Fuji visibility · clear today" },
      { time: "20:30", name: "Train back to Tokyo", cat: "Transit", state: "done" },
    ],
  },
  {
    n: 5, label: "Fri · Apr 28", subtitle: "Today · Tokyo Bay", today: true,
    places: [
      { id: "d5-tsukiji", time: "09:30", name: "Tsukiji Outer Market", cat: "Food", state: "done", sub: "Sushi breakfast at Sushi Bun", note: "Bring cash. Most stalls don't take cards." },
      {
        id: "d5-teamlab", time: "11:30", name: "teamLab Planets", cat: "Museum", state: "done",
        sub: "Toyosu · timed entry 11:30",
        travel: { mode: "Subway", detail: "Yurakucho line · 12 min" },
        confirmation: { label: "Order", code: "TLP-9F2K-7741" },
        docs: [
          { id: "tl-tix", name: "teamLab Planets — 2 tickets.pdf", kind: "pdf", size: "184 KB", offline: true },
        ],
      },
      {
        id: "d5-hama", time: "14:00", name: "Hamarikyu Gardens", cat: "Park", state: "now",
        sub: "Tea house in pond · 700¥", note: "Currently here. Tea ceremony at 15:00 if interested.",
        travel: { mode: "Walk", detail: "Yurikamome line · 14 min" },
        docs: [
          { id: "hm-map", name: "Garden map + tea house guide.pdf", kind: "pdf", size: "612 KB", offline: true },
        ],
      },
      { id: "d5-shibuya", time: "17:30", name: "Shibuya Sky", cat: "View", state: "next", sub: "46th floor · sunset slot", travel: { mode: "Train", detail: "Toei Asakusa · 18 min" } },
      {
        id: "d5-saito", time: "20:00", name: "Sushi Saito", cat: "Dinner", state: "next",
        sub: "Roppongi · omakase ¥30,000pp", note: "Address sent to phone.",
        confirmation: { label: "Reservation", code: "SAITO-20260428-2P" },
        docs: [
          { id: "ss-rsv", name: "Sushi Saito — Reservation.pdf", kind: "pdf", size: "92 KB", offline: true },
          { id: "ss-menu", name: "Omakase menu — April.jpg", kind: "image", size: "1.4 MB", offline: true },
        ],
      },
    ],
  },
  {
    n: 6, label: "Sat · Apr 29", subtitle: "Shopping + nightlife",
    places: [
      { time: "10:00", name: "Shimokitazawa walk", cat: "Walk", state: "next", sub: "Vintage + record shops loop" },
      { time: "13:00", name: "CoCo Curry House", cat: "Lunch", state: "next" },
      { time: "15:00", name: "Shinjuku Gyoen", cat: "Park", state: "next", sub: "Late cherry blossoms" },
      { time: "21:00", name: "Golden Gai bar crawl", cat: "Drinks", state: "next", sub: "Kabukicho · cash only" },
    ],
  },
  {
    n: 7, label: "Sun · May 1", subtitle: "Departure",
    places: [
      { time: "11:00", name: "Park Hyatt · checkout", cat: "Hotel", state: "next" },
      { time: "13:30", name: "Narita Express → NRT", cat: "Transit", state: "next", travel: { mode: "Train", detail: "60 min" } },
      { time: "17:50", name: "Flight JL 0006 to LAX", cat: "Departure", state: "next", sub: "Terminal 2 · gate 33" },
    ],
  },
];

export const TOKYO_DOCS: DocRailItem[] = [
  { name: "JL 0007 boarding pass · arrival", type: "Flight", cached: true },
  { name: "Park Hyatt confirmation HZ-49281", type: "Hotel", cached: true },
  { name: "Hakone Free Pass voucher", type: "Transit", cached: true },
  { name: "Sushi Saito reservation note", type: "Dining", cached: true },
  { name: "JL 0006 boarding pass · departure", type: "Flight", cached: false },
  { name: "Travel insurance · Allianz", type: "Insurance", cached: true },
  { name: "JR Pass voucher", type: "Transit", cached: true },
];

export const TOKYO_PACKING: PackingItem[] = [
  { n: "Passport", done: true },
  { n: "JR Pass voucher", done: true },
  { n: "Pasmo card", done: true },
  { n: "Universal adapter", done: true },
  { n: "Light rain shell", done: true },
  { n: "Walking shoes", done: true },
  { n: "Yen cash · ¥40,000", done: false },
  { n: "Pocket Wi-Fi pickup", done: false },
];

export const TOKYO_COLLAB: Collaborator[] = [
  { n: "Maya R.", e: "maya@packt.local", role: "Owner", i: "MR", tint: { bg: "oklch(0.86 0.05 8)", fg: "oklch(0.30 0.08 8)" } },
  { n: "Jules K.", e: "jules@packt.local", role: "Edit", i: "JK", tint: { bg: "oklch(0.86 0.05 200)", fg: "oklch(0.30 0.05 200)" } },
];
