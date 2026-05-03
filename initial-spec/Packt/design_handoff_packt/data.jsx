// data.jsx — sample data + cover photo placeholder component

// Trip cover — striped SVG placeholder with destination label.
// Honest about being a placeholder, but tinted by destination so each trip is distinct.
const TRIP_TINTS = {
  Tokyo:    { hue: 8,   l: 'oklch(0.94 0.04 8)',   d: 'oklch(0.28 0.05 8)'   },
  Lisbon:   { hue: 78,  l: 'oklch(0.95 0.04 78)',  d: 'oklch(0.30 0.04 78)'  },
  Oaxaca:   { hue: 45,  l: 'oklch(0.94 0.05 45)',  d: 'oklch(0.30 0.05 45)'  },
  Reykjavik:{ hue: 220, l: 'oklch(0.94 0.03 220)', d: 'oklch(0.28 0.04 220)' },
  Marrakech:{ hue: 30,  l: 'oklch(0.93 0.06 30)',  d: 'oklch(0.30 0.06 30)'  },
  Kyoto:    { hue: 350, l: 'oklch(0.94 0.04 350)', d: 'oklch(0.30 0.04 350)' },
  Athens:   { hue: 200, l: 'oklch(0.95 0.03 200)', d: 'oklch(0.30 0.04 200)' },
  Hanoi:    { hue: 150, l: 'oklch(0.94 0.04 150)', d: 'oklch(0.30 0.04 150)' },
  Patagonia:{ hue: 245, l: 'oklch(0.94 0.03 245)', d: 'oklch(0.28 0.04 245)' },
  Default:  { hue: 60,  l: 'oklch(0.94 0.02 60)',  d: 'oklch(0.30 0.02 60)'  },
};

function TripCover({ name, country, sub, dark, label = 'PLACEHOLDER · COVER', size = 'lg', hideCity = false, hideMeta = false }) {
  const tint = TRIP_TINTS[name] || TRIP_TINTS.Default;
  const bg = dark ? tint.d : tint.l;
  return (
    <div className="cover" style={{ background: bg }}>
      <div className="stripes" />
      {!hideMeta && label && <div className="meta">{label}</div>}
      {!hideCity && (
        <div className="city">
          {name}
          <span className="sub">{sub || country}</span>
        </div>
      )}
    </div>
  );
}

const SAMPLE_ACTIVE_TRIP = {
  id: 'tokyo-2026',
  name: 'Tokyo',
  country: 'Japan',
  status: 'active',
  startDate: 'Apr 24',
  endDate: 'May 1, 2026',
  dayN: 5,
  dayTotal: 7,
  collaborators: ['MR', 'JK'],
  todayDate: 28,
  todayMonth: 'Apr',
  events: [
    { id: 'tsukiji', time: '09:30', name: 'Tsukiji Outer Market', cat: 'Food',    state: 'done' },
    { id: 'teamlab', time: '11:30', name: 'teamLab Planets',     cat: 'Museum',  state: 'done' },
    { id: 'hama',    time: '14:00', name: 'Hamarikyu Gardens',    cat: 'Park',    state: 'now'  },
    { id: 'shibuya', time: '17:30', name: 'Shibuya Sky',          cat: 'View',    state: 'next' },
    { id: 'saito',   time: '20:00', name: 'Sushi Saito',          cat: 'Dinner',  state: 'next' },
  ],
};

const SAMPLE_UPCOMING = [
  {
    id: 'lisbon-2026',
    name: 'Lisbon',
    country: 'Portugal',
    status: 'upcoming',
    startDate: 'May 18',
    endDate: 'May 22, 2026',
    days: 4,
    inDays: 21,
    collaborators: ['MR', 'AC'],
    docs: 7,
  },
  {
    id: 'oaxaca-2026',
    name: 'Oaxaca',
    country: 'Mexico',
    status: 'upcoming',
    startDate: 'Jul 28',
    endDate: 'Aug 6, 2026',
    days: 9,
    inDays: 92,
    collaborators: ['MR'],
    docs: 3,
  },
  {
    id: 'reykjavik-2026',
    name: 'Reykjavik',
    country: 'Iceland',
    status: 'upcoming',
    startDate: 'Oct 12',
    endDate: 'Oct 20, 2026',
    days: 8,
    inDays: 168,
    collaborators: ['MR', 'JK', 'AC'],
    docs: 0,
  },
];

const SAMPLE_PAST = [
  { name: 'Marrakech',  country: 'Morocco',   date: 'Mar 2026', days: 6 },
  { name: 'Kyoto',      country: 'Japan',     date: 'Nov 2025', days: 4 },
  { name: 'Athens',     country: 'Greece',    date: 'Sep 2025', days: 5 },
  { name: 'Hanoi',      country: 'Vietnam',   date: 'May 2025', days: 8 },
  { name: 'Patagonia',  country: 'Argentina', date: 'Jan 2025', days: 12 },
];

// World pin coordinates (equirectangular, x: 0–1000, y: 0–500)
const WORLD_PINS = [
  { x: 760, y: 200, label: 'Tokyo' },
  { x: 750, y: 205, label: 'Kyoto' },
  { x: 770, y: 240, label: 'Hanoi' },
  { x: 470, y: 200, label: 'Lisbon' },
  { x: 540, y: 220, label: 'Athens' },
  { x: 490, y: 260, label: 'Marrakech' },
  { x: 270, y: 280, label: 'Oaxaca' },
  { x: 480, y: 130, label: 'Reykjavik' },
  { x: 320, y: 410, label: 'Patagonia' },
];

window.Packt_Data = {
  TripCover,
  SAMPLE_ACTIVE_TRIP,
  SAMPLE_UPCOMING,
  SAMPLE_PAST,
  WORLD_PINS,
};
