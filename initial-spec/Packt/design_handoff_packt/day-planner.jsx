// day-planner.jsx
// Day Planner — single-day view, hour-by-hour. Two-pane on desktop (timeline + map).
// Mobile: collapsed cards. Day 5 of Tokyo trip = today.

const DayPlanner = (() => {
  const I = window.Packt_Icons;
  const { TripCover } = window.Packt_Data;
  const { Btn, Badge, Avatar } = window.Packt_Components;

  // ── Day 5 schedule (richer than the trip-detail summary) ──
  // state: done | now | next
  // approxBucket: morning | afternoon | evening (only for flexible/untimed)
  const TIMED = [
    {
      id: 'tsukiji', time: '09:30', durMin: 90, end: '11:00',
      name: 'Tsukiji Outer Market', cat: 'Food', state: 'done',
      where: 'Tsukiji · 4-chōme',
      coords: { x: 0.20, y: 0.36 },
      note: 'Brought cash. Got tamagoyaki + uni at Sushi Bun. Wait was 25 min.',
    },
    {
      id: 'teamlab', time: '11:30', durMin: 120, end: '13:30',
      name: 'teamLab Planets',  cat: 'Museum', state: 'done',
      where: 'Toyosu · timed entry',
      coords: { x: 0.34, y: 0.55 },
      travelTo: { mode: 'Subway', detail: 'Yurakucho line', min: 12 },
      note: 'Timed entry 11:30 confirmed in app. Bring shorts (water rooms).',
      confirmation: { label: 'Order', code: 'TLP-9F2K-7741' },
      docs: [
        { id: 'tl-1', name: 'teamLab Planets — 2 tickets.pdf', kind: 'pdf', size: '184 KB', offline: true,
          previewLines: [
            ['TEAMLAB PLANETS TOKYO', 'h'],
            ['Order TLP-9F2K-7741', 'm'],
            ['', ''],
            ['Friday, April 28 · 11:30 entry', 'b'],
            ['2 × Adult · ¥3,800 each', 'b'],
            ['', ''],
            ['QR code at entry — phone or print', 'sm'],
          ] },
      ],
    },
    {
      id: 'lunch', time: '13:45', durMin: 60, end: '14:45',
      name: 'Bills · Odaiba',   cat: 'Lunch',  state: 'done',
      where: 'Odaiba · DiverCity',
      coords: { x: 0.42, y: 0.62 },
      travelTo: { mode: 'Walk', detail: 'covered arcade', min: 8 },
    },
    {
      id: 'hama', time: '15:00', durMin: 90, end: '16:30',
      name: 'Hamarikyu Gardens', cat: 'Park',   state: 'now',
      where: 'Chuo · pond + tea house',
      coords: { x: 0.30, y: 0.43 },
      travelTo: { mode: 'Train', detail: 'Yurikamome line', min: 14 },
      note: 'Tea ceremony at 15:30 in Nakajima-no-Ochaya · ¥850. Reserve at entrance.',
      docs: [
        { id: 'hm-1', name: 'Garden map + tea house guide.pdf', kind: 'pdf', size: '612 KB', offline: true,
          previewLines: [
            ['HAMARIKYU GARDENS', 'h'],
            ['Visitor map', 'm'],
            ['', ''],
            ['Nakajima-no-Ochaya tea house', 'b'],
            ['Open 09:00 – 16:30 · last order 16:00', 'b'],
            ['Matcha + wagashi · ¥850', 'b'],
            ['', ''],
            ['Pamphlet from Tokyo Metropolitan Parks', 'sm'],
          ] },
      ],
    },
    {
      id: 'shibuya', time: '17:30', durMin: 90, end: '19:00',
      name: 'Shibuya Sky',       cat: 'View',   state: 'next',
      where: 'Shibuya Scramble Square · 46F',
      coords: { x: 0.55, y: 0.30 },
      travelTo: { mode: 'Train', detail: 'Toei Asakusa line', min: 18 },
      note: 'Sunset slot 18:08. Free locker for bags. Helix outdoor deck closes if windy.',
    },
    {
      id: 'saito', time: '20:00', durMin: 120, end: '22:00',
      name: 'Sushi Saito',       cat: 'Dinner', state: 'next',
      where: 'Roppongi · ARK Hills',
      coords: { x: 0.66, y: 0.42 },
      travelTo: { mode: 'Taxi', detail: 'go straight, no detour', min: 15 },
      note: 'Omakase ¥30,000pp. Card ok. Quiet room — phones off.',
      confirmation: { label: 'Reservation', code: 'SAITO-20260428-2P' },
      docs: [
        { id: 'ss-1', name: 'Sushi Saito — Reservation.pdf', kind: 'pdf', size: '92 KB', offline: true,
          previewLines: [
            ['SUSHI SAITO', 'h'],
            ['Reservation confirmation', 'm'],
            ['', ''],
            ['Friday, April 28 · 20:00', 'b'],
            ['2 guests · counter seating', 'b'],
            ['Confirmation: SAITO-20260428-2P', 'b'],
            ['', ''],
            ['Dress: smart casual. No fragrance.', 'b'],
            ['Cancellation up to 48h before: free.', 'b'],
            ['After: full course charge applies.', 'b'],
            ['', ''],
            ['Roppongi 1-Chome · ARK Hills South Tower 1F', 'sm'],
            ['+81 3-3589-4412 · Tabelog reservation #4412', 'sm'],
          ] },
        { id: 'ss-2', name: 'Omakase menu — April.jpg', kind: 'image', size: '1.4 MB', offline: true,
          previewLines: [
            ['OMAKASE · APRIL', 'h'],
            ['Photographed menu card', 'sm'],
          ] },
      ],
    },
  ];

  const FLEXIBLE = [
    { id: 'starbucks', name: 'Starbucks Reserve · Nakameguro', cat: 'Coffee', bucket: 'morning', where: '4-min from station' },
    { id: 'kiddyland', name: 'Kiddy Land Harajuku',            cat: 'Shop',   bucket: 'afternoon', where: 'If we have time before Shibuya' },
    { id: 'goldengai', name: 'Golden Gai walk-through',        cat: 'Drinks', bucket: 'evening', where: 'Optional after dinner' },
  ];

  // ── Helpers ──
  const catTone = (cat) => ({
    'Food': 'oklch(0.78 0.10 60)',
    'Lunch': 'oklch(0.78 0.10 60)',
    'Dinner': 'oklch(0.74 0.13 25)',
    'Drinks': 'oklch(0.66 0.14 320)',
    'Coffee': 'oklch(0.70 0.10 50)',
    'Museum': 'oklch(0.75 0.09 280)',
    'View': 'oklch(0.74 0.10 220)',
    'Park': 'oklch(0.75 0.10 145)',
    'Shop': 'oklch(0.78 0.08 30)',
    'Walk': 'oklch(0.75 0.10 145)',
  }[cat] || 'oklch(0.75 0.06 250)');

  const catIco = (cat) => {
    if (['Food','Lunch','Dinner','Drinks','Coffee'].includes(cat)) return <I.Coffee size={12}/>;
    if (['Museum','View','Show','Culture'].includes(cat)) return <I.Camera size={12}/>;
    if (['Park','Walk','Boat'].includes(cat)) return <I.MapPin size={12}/>;
    if (['Transit','Arrival','Departure'].includes(cat)) return <I.Plane size={12}/>;
    if (cat === 'Hotel') return <I.Bed size={12}/>;
    if (cat === 'Shop') return <I.Suitcase size={12}/>;
    return <I.MapPin size={12}/>;
  };

  // ── Documents subcomponent ──
  function DocBadge({ kind }) {
    const tone = kind === 'pdf' ? 'oklch(0.72 0.12 25)'
      : kind === 'image' ? 'oklch(0.72 0.10 145)'
      : kind === 'doc' ? 'oklch(0.70 0.10 250)'
      : 'oklch(0.70 0.04 250)';
    const label = kind === 'pdf' ? 'PDF' : kind === 'image' ? 'IMG' : kind === 'doc' ? 'DOC' : 'FILE';
    return (
      <span className="doc-badge" style={{ '--tone': tone }}>
        <I.Doc size={14} />
        <span className="ext">{label}</span>
      </span>
    );
  }

  function Docs({ docs, onOpen, compact = false }) {
    if (!docs || !docs.length) return null;
    return (
      <div className={`docs ${compact ? 'compact' : ''}`}>
        <span className="ln">DOCS</span>
        <div className="list">
          {docs.map((d) => (
            <button key={d.id} className="doc-row" onClick={(e) => { e.stopPropagation(); onOpen(d); }}>
              <DocBadge kind={d.kind} />
              <span className="meta">
                <span className="n">{d.name}</span>
                <span className="x">
                  <span>{d.size}</span>
                </span>
              </span>
              <span className="actions" onClick={(e) => e.stopPropagation()}>
                {d.offline ? (
                  <span className="off-pill" title="Available offline">
                    <I.DownloadDone size={11}/>Offline
                  </span>
                ) : (
                  <button className="ic" title="Download" onClick={(e) => { e.stopPropagation(); }}>
                    <I.Download size={12}/>
                  </button>
                )}
                <button className="ic primary" title="View" onClick={(e) => { e.stopPropagation(); onOpen(d); }}>
                  <I.ChevronR size={13}/>
                </button>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Document viewer overlay ──
  function DocViewer({ doc, eventName, onClose }) {
    React.useEffect(() => {
      function onKey(e) { if (e.key === 'Escape') onClose(); }
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    if (!doc) return null;
    return (
      <div className="doc-viewer" onClick={onClose}>
        <div className="dv-frame" onClick={(e) => e.stopPropagation()}>
          <header className="dv-bar">
            <DocBadge kind={doc.kind} />
            <div className="dv-title">
              <div className="n">{doc.name}</div>
              <div className="x">
                {eventName && <span>{eventName}</span>}
                <span>· {doc.size}</span>
                {doc.offline && <span className="off"><I.DownloadDone size={10}/>Available offline</span>}
              </div>
            </div>
            <div className="dv-actions">
              <button className="btn outline sm"><I.Download size={12}/>Download</button>
              <button className="btn outline sm"><I.Share size={12}/>Share</button>
              <button className="btn ghost icon sm" onClick={onClose} title="Close"><I.X size={14}/></button>
            </div>
          </header>
          <div className={`dv-page ${doc.kind}`}>
            <div className="paper">
              {(doc.previewLines || []).map((line, i) => {
                const [text, lvl] = line;
                if (!text) return <div key={i} className="sp" />;
                return <div key={i} className={`pl ${lvl}`}>{text}</div>;
              })}
              <div className="watermark">PREVIEW</div>
            </div>
          </div>
          <footer className="dv-foot">
            <span className="hint">ESC to close</span>
            <span className="grow" />
            <span className="hint">Page 1 of 1</span>
          </footer>
        </div>
      </div>
    );
  }

  // ── Header (in-page, between trip header and timeline) ──
  function DayHeader({ onBackToTrip }) {
    return (
      <div className="dp-header">
        <div className="crumb-row">
          <button className="btn ghost sm" onClick={onBackToTrip}><I.ChevronL size={14}/>Trip</button>
          <span className="sep">/</span>
          <button className="btn ghost sm" onClick={onBackToTrip}>Tokyo</button>
          <span className="sep">/</span>
          <span className="here">Day 5</span>
          <div className="actions">
            <Btn variant="outline" size="sm" icon={<I.Share size={13}/>}>Share day</Btn>
            <Btn variant="outline" size="sm" icon={<I.Plus size={13}/>}>Add place</Btn>
          </div>
        </div>

        <div className="dp-day-row">
          <button className="btn ghost icon"><I.ChevronL size={15}/></button>
          <div className="dp-day-meta">
            <div className="d">Friday, April 28</div>
            <div className="m">DAY 5 · TODAY · TOKYO BAY</div>
          </div>
          <div className="dp-spacer" />
          <div className="dp-stats">
            <span><I.MapPin size={12}/>5 stops</span>
            <span><I.Clock size={12}/>09:30 – 22:00</span>
            <span style={{ color: 'var(--accent)' }}><I.Sun size={12}/>22° · partly cloudy</span>
            <span className="route-chip" title="6 stops · ~14 km · 1h 5m by transit">
              <I.Map size={12}/>~14 km · 1h 5m
            </span>
            <Btn variant="outline" size="sm" icon={<I.Map size={13}/>}>Open map</Btn>
          </div>
          <button className="btn ghost icon"><I.ChevronR size={15}/></button>
        </div>
      </div>
    );
  }

  function DayNote() {
    return (
      <div className="dp-day-note">
        <span className="lab">DAY NOTES</span>
        <p>Easy day — Bay area mostly walkable. Carry portable charger. Sushi Saito is the splurge tonight, dress smart-casual. Trains slow after 23:00 so plan return from Roppongi.</p>
        <button className="btn ghost sm"><I.Edit size={12}/>Edit note</button>
      </div>
    );
  }

  function FlexibleSection() {
    const [bucket, setBucket] = React.useState('all');
    const buckets = [
      { id: 'all',       label: 'All' },
      { id: 'morning',   label: 'Morning' },
      { id: 'afternoon', label: 'Afternoon' },
      { id: 'evening',   label: 'Evening' },
    ];
    const list = bucket === 'all' ? FLEXIBLE : FLEXIBLE.filter(x => x.bucket === bucket);
    return (
      <div className="dp-flex">
        <header>
          <div className="t">Flexible · no fixed time</div>
          <div className="bucket-tabs">
            {buckets.map(b => (
              <button key={b.id} className={bucket === b.id ? 'on' : ''} onClick={() => setBucket(b.id)}>{b.label}</button>
            ))}
          </div>
        </header>
        <div className="flex-body">
          {list.map(p => (
            <div key={p.id} className="flex-card">
              <span className="bk" data-bucket={p.bucket}>{p.bucket.toUpperCase()}</span>
              <div className="info">
                <div className="n">{p.name}</div>
                <div className="s"><span style={{ color: catTone(p.cat) }}>{catIco(p.cat)}{p.cat}</span><span>· {p.where}</span></div>
              </div>
              <div className="actions">
                <button className="btn ghost icon sm" title="Schedule"><I.Clock size={13}/></button>
                <button className="btn ghost icon sm" title="More"><I.More size={13}/></button>
              </div>
            </div>
          ))}
          <button className="add-flex">
            <I.Plus size={13}/>Add flexible place
          </button>
        </div>
      </div>
    );
  }

  // ── Timeline place row ──
  function TimedRow({ p, index, expanded, onToggle, hover, onHover, onOpenDoc }) {
    return (
      <>
        {p.travelTo && p.state !== 'done' && (
          <div className="dp-travel">
            <div className="rail" />
            <div className="seg">
              <span className="ico"><I.Plane size={12}/></span>
              <span>{p.travelTo.mode} · {p.travelTo.min} min</span>
              <span className="dim">· {p.travelTo.detail}</span>
            </div>
          </div>
        )}
        {p.travelTo && p.state === 'done' && (
          <div className="dp-travel done">
            <div className="rail" />
            <div className="seg">
              <span className="ico"><I.Check size={11}/></span>
              <span>{p.travelTo.mode} · {p.travelTo.min} min</span>
            </div>
          </div>
        )}
        <div
          className={`dp-row ${p.state} ${expanded ? 'open' : ''} ${hover ? 'hov' : ''}`}
          data-event-id={p.id}
          onMouseEnter={() => onHover(p.id)}
          onMouseLeave={() => onHover(null)}
        >
          <div className="when">
            <span className="t">{p.time}</span>
            <span className="dur">{p.durMin}m</span>
            <span className="end">→ {p.end}</span>
          </div>

          <div className="rail">
            <button className="grip" title="Drag to reorder" onClick={(e) => e.stopPropagation()}>
              <span /><span /><span />
            </button>
            <div className="dot">
              {p.state === 'done' ? <I.Check size={12}/>
                : p.state === 'now' ? <span className="pulse" />
                : <span className="ring" />}
            </div>
          </div>

          <div
            className="card"
            role="button"
            tabIndex={0}
            onClick={() => onToggle(p.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(p.id); } }}
          >
            <div className="head">
              <span className="num" style={{ background: 'var(--surface)', color: 'var(--fg-3)' }}>{index + 1}</span>
              <div className="n">{p.name}</div>
              <span className="cat" style={{ color: catTone(p.cat) }}>{catIco(p.cat)}{p.cat}</span>
              {p.state === 'now' && <span className="now-pill">NOW</span>}
              <span className="chev"><I.ChevronD size={14}/></span>
            </div>
            <div className="meta">
              <span><I.MapPin size={11}/>{p.where}</span>
              {p.confirmation && (
                <span className="conf-pill" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(p.confirmation.code); }} title="Copy confirmation code">
                  <span className="lbl">{p.confirmation.label}</span>
                  <span className="code">{p.confirmation.code}</span>
                </span>
              )}
              {p.docs && p.docs.length > 0 && !expanded && (
                <span className="attach-chip" title={`${p.docs.length} document${p.docs.length > 1 ? 's' : ''} attached`}>
                  <I.Doc size={11}/>{p.docs.length}
                </span>
              )}
            </div>
            {expanded && (
              <div className="body">
                {p.note && (
                  <div className="note">
                    <span className="ln">NOTE</span>
                    <p>{p.note}</p>
                  </div>
                )}
                <Docs docs={p.docs} onOpen={onOpenDoc} />
                <div className="actions">
                  <Btn variant="outline" size="sm" icon={<I.MapPin size={12}/>}>Open in map</Btn>
                  <Btn variant="outline" size="sm" icon={<I.Edit size={12}/>}>Edit</Btn>
                  <Btn variant="ghost" size="sm" icon={<I.Clock size={12}/>}>Reschedule</Btn>
                  <div style={{ flex: 1 }} />
                  {p.state !== 'done' && <Btn variant="ghost" size="sm" icon={<I.Check size={12}/>}>Mark visited</Btn>}
                  <button className="btn ghost icon sm" title="Remove"><I.X size={13}/></button>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ── Day map (right pane) ──
  function DayMap({ active, onPin }) {
    const stops = TIMED;
    const path = stops.map((s, i) => `${i === 0 ? 'M' : 'L'} ${s.coords.x * 100} ${s.coords.y * 100}`).join(' ');
    return (
      <aside className="dp-map">
        <header>
          <div>
            <div className="t">Today's route</div>
            <div className="x">{stops.length} stops · ~14 km · 1h 5m by transit</div>
          </div>
          <button className="btn outline sm">Open full map</button>
        </header>
        <div className="map">
          {/* Grid background */}
          <svg className="grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <defs>
              <pattern id="dpgrid" width="6.25" height="6.25" patternUnits="userSpaceOnUse">
                <path d="M 6.25 0 L 0 0 0 6.25" stroke="var(--line)" strokeWidth="0.15" fill="none"/>
              </pattern>
              <pattern id="dpgridDot" width="6.25" height="6.25" patternUnits="userSpaceOnUse">
                <circle cx="3.125" cy="3.125" r="0.4" fill="var(--line-strong)"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#dpgrid)"/>
            <rect width="100" height="100" fill="url(#dpgridDot)"/>
          </svg>

          {/* Bay/water region */}
          <svg className="water" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path d="M 0 60 Q 25 55, 45 65 T 100 70 L 100 100 L 0 100 Z" fill="var(--surface)" opacity="0.7"/>
            <path d="M 0 60 Q 25 55, 45 65 T 100 70" stroke="var(--line)" strokeWidth="0.3" fill="none"/>
          </svg>

          {/* Route */}
          <svg className="route" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={path} stroke="var(--accent)" strokeWidth="0.6" strokeDasharray="0.8 1.2" strokeLinecap="round" fill="none" opacity="0.6"/>
          </svg>

          {/* Pins */}
          {stops.map((s, i) => (
            <button
              key={s.id}
              className={`pin ${s.state} ${active === s.id ? 'active' : ''}`}
              style={{ left: `${s.coords.x * 100}%`, top: `${s.coords.y * 100}%` }}
              onMouseEnter={() => onPin(s.id)}
              onMouseLeave={() => onPin(null)}
              title={s.name}
            >
              <span className="num">{i + 1}</span>
              {active === s.id && (
                <span className="callout">
                  <span className="cn">{s.name}</span>
                  <span className="ct">{s.time} · {s.where}</span>
                </span>
              )}
            </button>
          ))}

          {/* "You are here" marker */}
          <div
            className="here-marker"
            style={{ left: `${stops.find(s => s.state === 'now').coords.x * 100}%`, top: `${stops.find(s => s.state === 'now').coords.y * 100}%` }}
            title="You are here"
          >
            <span className="ring1" />
            <span className="ring2" />
          </div>

          {/* Compass / scale */}
          <div className="scale">500 m</div>
          <div className="compass">N</div>
        </div>

        {/* Legend / now panel */}
        <div className="now-panel">
          <div className="row">
            <span className="lab">YOU ARE AT</span>
            <span className="v">Hamarikyu Gardens</span>
          </div>
          <div className="row">
            <span className="lab">NEXT</span>
            <span className="v">Shibuya Sky · in 1h 22m</span>
          </div>
          <div className="row last">
            <span className="lab">DAY ENDS</span>
            <span className="v">22:00 · ARK Hills, Roppongi</span>
          </div>
        </div>
      </aside>
    );
  }

  // ── Desktop ──
  function DesktopDayPlanner({ dark, onBack, focusId }) {
    const [open, setOpen] = React.useState(focusId || 'hama'); // current event expanded by default
    const [hov, setHov] = React.useState(null);
    const [viewerDoc, setViewerDoc] = React.useState(null);
    const [viewerEvent, setViewerEvent] = React.useState(null);
    const onToggle = (id) => setOpen(open === id ? null : id);
    const onOpenDoc = (doc, eventName) => { setViewerDoc(doc); setViewerEvent(eventName); };
    const timelineRef = React.useRef(null);

    React.useEffect(() => {
      if (!focusId) return;
      setOpen(focusId);
      // Find the nearest scrollable ancestor (could be .dp-timeline OR .td-main).
      const findScroller = (el) => {
        let n = el && el.parentElement;
        while (n) {
          const cs = getComputedStyle(n);
          if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) return n;
          n = n.parentElement;
        }
        return null;
      };
      const tries = [40, 140, 320];
      tries.forEach(t => setTimeout(() => {
        const root = timelineRef.current;
        if (!root) return;
        const el = root.querySelector(`[data-event-id="${focusId}"]`);
        if (!el) return;
        const scroller = findScroller(el) || root;
        const sRect = scroller.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        const target = scroller.scrollTop + (eRect.top - sRect.top) - 32;
        scroller.scrollTo({ top: Math.max(0, target), behavior: t === tries[0] ? 'auto' : 'smooth' });
      }, t));
    }, [focusId]);

    return (
      <div className="td">
        {/* Reuse trip sidebar */}
        <Packt_TripDetail.TripSidebar active="itin" />

        <div className="td-main scroll">
          <DayHeader onBackToTrip={onBack} />

          <div className="dp-grid">
            <div className="dp-timeline scroll" ref={timelineRef} data-screen-label="day-planner-timeline">
              <DayNote />
              <FlexibleSection />

              <div className="dp-timed-section">
                <header>
                  <div className="t">Scheduled</div>
                  <div className="x">5 STOPS · 09:30 – 22:00</div>
                </header>
                <div className="dp-timed">
                  {TIMED.map((p, i) => (
                    <TimedRow
                      key={p.id}
                      p={p}
                      index={i}
                      expanded={open === p.id}
                      onToggle={onToggle}
                      hover={hov === p.id}
                      onHover={setHov}
                      onOpenDoc={(d) => onOpenDoc(d, p.name)}
                    />
                  ))}
                  <button className="dp-add">
                    <span className="ico"><I.Plus size={14}/></span>
                    <span className="t">Add a place</span>
                    <span className="x">Drop a pin or search by name</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <DocViewer doc={viewerDoc} eventName={viewerEvent} onClose={() => setViewerDoc(null)} />
      </div>
    );
  }

  // ── Mobile ──
  function MobileDayPlanner({ dark, onBack, focusId }) {
    const [open, setOpen] = React.useState(focusId || 'hama');
    const [section, setSection] = React.useState('all'); // all | flex | scheduled
    const [viewerDoc, setViewerDoc] = React.useState(null);
    const [viewerEvent, setViewerEvent] = React.useState(null);
    const onOpenDoc = (doc, eventName) => { setViewerDoc(doc); setViewerEvent(eventName); };
    const listRef = React.useRef(null);

    React.useEffect(() => {
      if (!focusId) return;
      setOpen(focusId);
      setSection('all');
      const tries = [0, 80, 220];
      tries.forEach(t => setTimeout(() => {
        const root = listRef.current;
        if (!root) return;
        const el = root.querySelector(`[data-event-id="${focusId}"]`);
        if (!el) return;
        const rRect = root.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        const target = root.scrollTop + (eRect.top - rRect.top) - 16;
        root.scrollTo({ top: Math.max(0, target), behavior: t === 0 ? 'auto' : 'smooth' });
      }, t));
    }, [focusId]);

    return (
      <div className="mob">
        <div className="mob-status">
          <span>9:41</span>
          <span className="right">
            <I.Wifi size={14} />
            <span style={{ width: 22, height: 11, border: '1.5px solid var(--fg)', borderRadius: 3, position: 'relative', display: 'inline-block' }}>
              <span style={{ position: 'absolute', inset: 1, background: 'var(--fg)', width: '70%', borderRadius: 1 }} />
            </span>
          </span>
        </div>

        <div className="dpm-top">
          <button className="btn-circle" onClick={onBack}><I.ChevronL size={16}/></button>
          <div className="ctx">
            <div className="trip">TOKYO</div>
            <div className="dy">Friday, April 28</div>
          </div>
          <button className="btn-circle"><I.More size={16}/></button>
        </div>

        <div className="dpm-day-rail">
          <button className="btn-circle"><I.ChevronL size={14}/></button>
          <div className="strip">
            {[
              { d: 24, n: 1, label: 'Mon' },
              { d: 25, n: 2, label: 'Tue' },
              { d: 26, n: 3, label: 'Wed' },
              { d: 27, n: 4, label: 'Thu' },
              { d: 28, n: 5, label: 'Fri', active: true },
              { d: 29, n: 6, label: 'Sat' },
              { d: 30, n: 7, label: 'Sun' },
            ].map(d => (
              <button key={d.n} className={`day-pill ${d.active ? 'on' : ''}`}>
                <span className="lbl">{d.label}</span>
                <span className="d">{d.d}</span>
                <span className="n">D{d.n}</span>
              </button>
            ))}
          </div>
          <button className="btn-circle"><I.ChevronR size={14}/></button>
        </div>

        <div className="dpm-day-summary">
          <div>
            <div className="t">Today · Tokyo Bay</div>
            <div className="s">5 stops · 09:30 – 22:00 · 22° partly cloudy</div>
          </div>
          <button className="btn ghost icon sm"><I.Plus size={14}/></button>
        </div>

        <div className="dpm-list scroll" ref={listRef}>
          {/* Day notes */}
          <div className="dpm-note">
            <span className="lab">DAY NOTES</span>
            <p>Easy day — Bay area mostly walkable. Sushi Saito is the splurge tonight, dress smart-casual.</p>
          </div>

          {/* Flexible */}
          <div className="dpm-flex">
            <header>
              <span className="t">Flexible</span>
              <span className="x">{FLEXIBLE.length} ideas</span>
            </header>
            <div className="cards">
              {FLEXIBLE.map(p => (
                <div key={p.id} className="card">
                  <span className="bk" data-bucket={p.bucket}>{p.bucket[0].toUpperCase()}</span>
                  <div className="i">
                    <div className="n">{p.name}</div>
                    <div className="s">{p.cat} · {p.where}</div>
                  </div>
                  <button className="btn ghost icon sm"><I.Plus size={12}/></button>
                </div>
              ))}
            </div>
          </div>

          {/* Scheduled */}
          <div className="dpm-scheduled">
            <header>
              <span className="t">Scheduled</span>
              <span className="x">5 stops</span>
            </header>
            {TIMED.map((p, i) => {
              const isOpen = open === p.id;
              return (
                <React.Fragment key={p.id}>
                  {p.travelTo && (
                    <div className="dpm-travel">
                      <span className="ico"><I.Plane size={11}/></span>
                      <span>{p.travelTo.mode} · {p.travelTo.min} min</span>
                    </div>
                  )}
                  <div
                    className={`dpm-card ${p.state} ${isOpen ? 'open' : ''}`}
                    data-event-id={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(isOpen ? null : p.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : p.id); } }}
                  >
                    <div className="when">
                      <span className="t">{p.time}</span>
                      <span className="d">{p.durMin}m</span>
                    </div>
                    <div className="rail">
                      <div className="dot">
                        {p.state === 'done' ? <I.Check size={10}/>
                          : p.state === 'now' ? <span className="pulse" />
                          : <span className="ring" />}
                      </div>
                    </div>
                    <div className="info">
                      <div className="head">
                        <span className="num">{i + 1}</span>
                        <span className="n">{p.name}</span>
                        {p.state === 'now' && <span className="np">NOW</span>}
                      </div>
                      <div className="meta">
                        <span style={{ color: catTone(p.cat) }}>{p.cat}</span>
                        <span>· {p.where}</span>
                        {p.docs && p.docs.length > 0 && !isOpen && (
                          <span className="attach-chip"><I.Doc size={10}/>{p.docs.length}</span>
                        )}
                      </div>
                      {isOpen && p.confirmation && (
                        <div className="conf-row">
                          <span className="lbl">{p.confirmation.label}</span>
                          <span className="code">{p.confirmation.code}</span>
                          <button className="copy" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(p.confirmation.code); }} title="Copy">
                            <I.Doc size={10}/>
                          </button>
                        </div>
                      )}
                      {isOpen && p.note && (
                        <div className="note">
                          <span className="ln">NOTE</span>
                          <p>{p.note}</p>
                        </div>
                      )}
                      {isOpen && <Docs docs={p.docs} onOpen={(d) => onOpenDoc(d, p.name)} compact />}
                      {isOpen && (
                        <div className="actions">
                          <button className="ab" onClick={(e) => e.stopPropagation()}><I.MapPin size={11}/>Map</button>
                          <button className="ab" onClick={(e) => e.stopPropagation()}><I.Edit size={11}/>Edit</button>
                          {p.state !== 'done' && <button className="ab" onClick={(e) => e.stopPropagation()}><I.Check size={11}/>Done</button>}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <button className="dpm-add"><I.Plus size={13}/>Add a place</button>
          </div>
        </div>

        <div className="mob-tabbar">
          <button className="on"><I.Suitcase /><span>Trips</span></button>
          <button><I.Search /><span>Search</span></button>
          <button><I.Globe /><span>Map</span></button>
          <button><I.User /><span>Profile</span></button>
        </div>

        <DocViewer doc={viewerDoc} eventName={viewerEvent} onClose={() => setViewerDoc(null)} />
      </div>
    );
  }

  return { DesktopDayPlanner, MobileDayPlanner };
})();

window.Packt_DayPlanner = DayPlanner;
