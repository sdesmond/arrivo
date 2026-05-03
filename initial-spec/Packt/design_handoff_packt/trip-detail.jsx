// trip-detail.jsx — Trip Detail page (Tokyo)
// Itinerary overview: hero, day blocks with timeline of places, side rail (map, docs, packing, collaborators)

const TripDetail = (() => {
  const I = window.Packt_Icons;
  const { TripCover } = window.Packt_Data;
  const { Btn, Badge, Avatar } = window.Packt_Components;

  // Tokyo itinerary — 7 days
  const TOKYO_DAYS = [
    {
      n: 1, label: 'Mon · Apr 24', subtitle: 'Arrival',
      places: [
        { id: 'd1-nrt', time: '14:30', name: 'Narita Airport (NRT)',         cat: 'Arrival',  state: 'done', sub: 'Terminal 2 · JL flight 0007', travel: { mode: 'Train', detail: 'Narita Express · 60 min' },
          confirmation: { label: 'Booking', code: 'JL-7H4K2P' },
          docs: [
            { id: 'jl0007', name: 'JL 0007 — Boarding pass.pdf', kind: 'pdf', size: '124 KB', offline: true,
              previewLines: [
                ['JAPAN AIRLINES', 'h'],
                ['Boarding pass · JL 0007', 'm'],
                ['', ''],
                ['Maya Reyes · Economy', 'b'],
                ['Seat 32K · Boarding 09:50', 'b'],
                ['SFO → NRT · April 24', 'b'],
                ['Booking ref: JL-7H4K2P', 'b'],
                ['', ''],
                ['Gate posts 60 min before departure', 'sm'],
              ] },
            { id: 'nex-vchr', name: 'Narita Express voucher.pdf', kind: 'pdf', size: '88 KB', offline: true,
              previewLines: [
                ['NARITA EXPRESS', 'h'],
                ['Round-trip voucher · 2 adults', 'm'],
                ['', ''],
                ['Outbound: NRT → Shinjuku · open ticket', 'b'],
                ['Return: Shinjuku → NRT · valid 14 days', 'b'],
                ['', ''],
                ['Exchange at JR EAST counter, B1F arrivals', 'sm'],
              ] },
          ],
        },
        { id: 'd1-hyatt', time: '16:00', name: 'Park Hyatt Tokyo',             cat: 'Hotel',    state: 'done', sub: 'Check-in · Shinjuku', note: 'Room block held until 18:00.',
          confirmation: { label: 'Reservation', code: 'HZ-49281' },
          docs: [
            { id: 'hyatt-cf', name: 'Park Hyatt — Confirmation.pdf', kind: 'pdf', size: '156 KB', offline: true,
              previewLines: [
                ['PARK HYATT TOKYO', 'h'],
                ['Booking confirmation HZ-49281', 'm'],
                ['', ''],
                ['Maya Reyes · 2 guests', 'b'],
                ['Apr 24 – May 1 · 7 nights', 'b'],
                ['Park Deluxe King · ¥68,000/night', 'b'],
                ['', ''],
                ['Check-in 15:00 · Check-out 12:00', 'b'],
                ['Late check-in arranged: room held until 18:00', 'b'],
                ['', ''],
                ['3-7-1-2 Nishi-Shinjuku, Shinjuku-ku', 'sm'],
                ['+81 3-5322-1234', 'sm'],
              ] },
          ],
        },
        { id: 'd1-donjaca', time: '19:30', name: 'Donjaca · izakaya',            cat: 'Dinner',   state: 'done', sub: 'Shinjuku · 6 min walk' },
      ],
    },
    {
      n: 2, label: 'Tue · Apr 25', subtitle: 'Old Tokyo',
      places: [
        { time: '09:00', name: 'Senso-ji Temple',              cat: 'Culture',  state: 'done', sub: 'Asakusa · arrive early to skip crowds' },
        { time: '12:00', name: 'Sometaro · okonomiyaki',       cat: 'Lunch',    state: 'done', sub: 'Asakusa', travel: { mode: 'Walk', detail: '8 min' } },
        { time: '15:00', name: 'Ueno Park · Tokyo Nat. Museum',cat: 'Museum',   state: 'done', sub: 'Free entry until 17:00' },
        { time: '20:00', name: 'Yakitori Toritsune',           cat: 'Dinner',   state: 'done', sub: 'Ueno · counter seating only' },
      ],
    },
    {
      n: 3, label: 'Wed · Apr 26', subtitle: 'West side',
      places: [
        { time: '10:30', name: 'Meiji Jingu Shrine',           cat: 'Culture',  state: 'done', sub: 'Harajuku' },
        { time: '13:00', name: 'Afuri Ramen · Harajuku',       cat: 'Lunch',    state: 'done', sub: 'Yuzu shio' },
        { time: '15:30', name: 'Cat Street + Omotesando',      cat: 'Walk',     state: 'done', sub: 'Architecture loop' },
        { time: '19:00', name: 'Robot Restaurant alt show',    cat: 'Show',     state: 'done', sub: 'Shinjuku · doors 18:30' },
      ],
    },
    {
      n: 4, label: 'Thu · Apr 27', subtitle: 'Day trip',
      places: [
        { time: '08:00', name: 'Shinkansen → Hakone',          cat: 'Transit',  state: 'done', sub: 'Round-trip · Hakone Free Pass' },
        { time: '11:00', name: 'Hakone Open-Air Museum',       cat: 'Museum',   state: 'done', sub: '90 min recommended' },
        { time: '14:00', name: 'Lake Ashi pirate ship',        cat: 'Boat',     state: 'done', sub: 'Mt Fuji visibility · clear today' },
        { time: '20:30', name: 'Train back to Tokyo',          cat: 'Transit',  state: 'done' },
      ],
    },
    // Today
    {
      n: 5, label: 'Fri · Apr 28', subtitle: 'Today · Tokyo Bay', today: true,
      places: [
        { id: 'd5-tsukiji', time: '09:30', name: 'Tsukiji Outer Market',         cat: 'Food',     state: 'done', sub: 'Sushi breakfast at Sushi Bun', note: 'Bring cash. Most stalls don\u2019t take cards.' },
        { id: 'd5-teamlab', time: '11:30', name: 'teamLab Planets',              cat: 'Museum',   state: 'done', sub: 'Toyosu · timed entry 11:30', travel: { mode: 'Subway', detail: 'Yurakucho line · 12 min' },
          confirmation: { label: 'Order', code: 'TLP-9F2K-7741' },
          docs: [
            { id: 'tl-tix', name: 'teamLab Planets — 2 tickets.pdf', kind: 'pdf', size: '184 KB', offline: true,
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
        { id: 'd5-hama', time: '14:00', name: 'Hamarikyu Gardens',            cat: 'Park',     state: 'now',  sub: 'Tea house in pond · 700¥', note: 'Currently here. Tea ceremony at 15:00 if interested.', travel: { mode: 'Walk', detail: 'Yurikamome line · 14 min' },
          docs: [
            { id: 'hm-map', name: 'Garden map + tea house guide.pdf', kind: 'pdf', size: '612 KB', offline: true,
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
        { id: 'd5-shibuya', time: '17:30', name: 'Shibuya Sky',                  cat: 'View',     state: 'next', sub: '46th floor · sunset slot', travel: { mode: 'Train', detail: 'Toei Asakusa · 18 min' } },
        { id: 'd5-saito', time: '20:00', name: 'Sushi Saito',                  cat: 'Dinner',   state: 'next', sub: 'Roppongi · omakase ¥30,000pp', note: 'Address sent to phone.',
          confirmation: { label: 'Reservation', code: 'SAITO-20260428-2P' },
          docs: [
            { id: 'ss-rsv', name: 'Sushi Saito — Reservation.pdf', kind: 'pdf', size: '92 KB', offline: true,
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
                ['', ''],
                ['Roppongi 1-Chome · ARK Hills South Tower 1F', 'sm'],
                ['+81 3-3589-4412 · Tabelog reservation #4412', 'sm'],
              ] },
            { id: 'ss-menu', name: 'Omakase menu — April.jpg', kind: 'image', size: '1.4 MB', offline: true,
              previewLines: [
                ['OMAKASE · APRIL', 'h'],
                ['Photographed menu card', 'sm'],
              ] },
          ],
        },
      ],
    },
    {
      n: 6, label: 'Sat · Apr 29', subtitle: 'Shopping + nightlife',
      places: [
        { time: '10:00', name: 'Shimokitazawa walk',           cat: 'Walk',     state: 'next', sub: 'Vintage + record shops loop' },
        { time: '13:00', name: 'CoCo Curry House',             cat: 'Lunch',    state: 'next' },
        { time: '15:00', name: 'Shinjuku Gyoen',               cat: 'Park',     state: 'next', sub: 'Late cherry blossoms' },
        { time: '21:00', name: 'Golden Gai bar crawl',         cat: 'Drinks',   state: 'next', sub: 'Kabukicho · cash only' },
      ],
    },
    {
      n: 7, label: 'Sun · May 1', subtitle: 'Departure',
      places: [
        { time: '11:00', name: 'Park Hyatt · checkout',        cat: 'Hotel',    state: 'next' },
        { time: '13:30', name: 'Narita Express → NRT',         cat: 'Transit',  state: 'next', travel: { mode: 'Train', detail: '60 min' } },
        { time: '17:50', name: 'Flight JL 0006 to LAX',        cat: 'Departure',state: 'next', sub: 'Terminal 2 · gate 33' },
      ],
    },
  ];

  const TOKYO_DOCS = [
    { name: 'JL 0007 boarding pass · arrival', type: 'Flight', cached: true },
    { name: 'Park Hyatt confirmation HZ-49281', type: 'Hotel',  cached: true },
    { name: 'Hakone Free Pass voucher',         type: 'Transit', cached: true },
    { name: 'Sushi Saito reservation note',     type: 'Dining', cached: true },
    { name: 'JL 0006 boarding pass · departure',type: 'Flight', cached: false },
    { name: 'Travel insurance · Allianz',       type: 'Insurance', cached: true },
    { name: 'JR Pass voucher',                  type: 'Transit', cached: true },
  ];

  const TOKYO_PACKING = [
    { n: 'Passport',           done: true },
    { n: 'JR Pass voucher',    done: true },
    { n: 'Pasmo card',         done: true },
    { n: 'Universal adapter',  done: true },
    { n: 'Light rain shell',   done: true },
    { n: 'Walking shoes',      done: true },
    { n: 'Yen cash · ¥40,000', done: false },
    { n: 'Pocket Wi-Fi pickup',done: false },
  ];

  const TOKYO_COLLAB = [
    { n: 'Maya R.',  e: 'maya@packt.local',   role: 'Owner',  i: 'MR', tint: { bg: 'oklch(0.86 0.05 8)',   fg: 'oklch(0.30 0.08 8)'   } },
    { n: 'Jules K.', e: 'jules@packt.local',  role: 'Edit',   i: 'JK', tint: { bg: 'oklch(0.86 0.05 200)', fg: 'oklch(0.30 0.05 200)' } },
  ];

  // ── Sidebar (re-used pattern, but with trip context) ──
  function TripSidebar() {
    return (
      <aside className="side scroll">
        <div className="brand-row">
          <span className="brand-mark" />
          <span className="name">Packt</span>
        </div>

        <h5>Workspace</h5>
        <div className="nav-item"><I.Suitcase className="ico" /><span>Trips</span><span className="count">4</span></div>
        <div className="nav-item"><I.Search className="ico" /><span>Search</span></div>
        <div className="nav-item"><I.Map className="ico" /><span>Map</span></div>
        <div className="nav-item"><I.Globe className="ico" /><span>World map</span></div>

        <h5>This trip</h5>
        <div className="nav-item on" style={{ paddingLeft: 10 }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: 'oklch(0.85 0.06 8)', flexShrink: 0 }} />
          <span>Tokyo</span>
          <span className="count">D5</span>
        </div>
        <div className="nav-item" style={{ paddingLeft: 30, fontSize: 12.5 }}><I.Calendar className="ico" size={13} /><span>Itinerary</span></div>
        <div className="nav-item" style={{ paddingLeft: 30, fontSize: 12.5 }}><I.MapPin className="ico" size={13} /><span>Map view</span></div>
        <div className="nav-item" style={{ paddingLeft: 30, fontSize: 12.5 }}><I.Doc className="ico" size={13} /><span>Documents</span><span className="count">7</span></div>
        <div className="nav-item" style={{ paddingLeft: 30, fontSize: 12.5 }}><I.List className="ico" size={13} /><span>Packing</span></div>

        <h5>Account</h5>
        <div className="nav-item"><I.User className="ico" /><span>Profile</span></div>
        <div className="nav-item"><I.Settings className="ico" /><span>Settings</span></div>

        <div className="footer">
          <Avatar initials="MR" style={{ background: 'oklch(0.86 0.05 8)', color: 'oklch(0.30 0.08 8)' }} />
          <div className="who">
            <div className="n">Maya R.</div>
            <div className="e">maya@packt.local</div>
          </div>
          <button className="btn ghost icon sm"><I.More size={14} /></button>
        </div>
      </aside>
    );
  }

  // ── Doc components (also used in day-planner) ──
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
            <button key={d.id} type="button" className="doc-row" onClick={(e) => { e.stopPropagation(); onOpen(d); }}>
              <DocBadge kind={d.kind} />
              <span className="meta">
                <span className="n">{d.name}</span>
                <span className="x">
                  <span>{d.size}</span>
                </span>
              </span>
              <span className="actions">
                {d.offline ? (
                  <span className="off-pill" title="Available offline">
                    <I.DownloadDone size={11}/>Offline
                  </span>
                ) : (
                  <span className="ic" title="Download" onClick={(e) => { e.stopPropagation(); }}>
                    <I.Download size={12}/>
                  </span>
                )}
                <span className="ic primary" title="View">
                  <I.ChevronR size={13}/>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

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

  // Place row — expandable
  function Place({ p, expanded, onToggle, onOpenDoc }) {
    const catIcon = {
      'Food': <I.Coffee size={12}/>, 'Lunch': <I.Coffee size={12}/>, 'Dinner': <I.Coffee size={12}/>, 'Drinks': <I.Coffee size={12}/>,
      'Hotel': <I.Bed size={12}/>,
      'Museum': <I.Camera size={12}/>, 'Show': <I.Camera size={12}/>, 'Culture': <I.Camera size={12}/>, 'View': <I.Camera size={12}/>,
      'Park': <I.MapPin size={12}/>, 'Walk': <I.MapPin size={12}/>, 'Boat': <I.MapPin size={12}/>,
      'Transit': <I.Plane size={12}/>, 'Arrival': <I.Plane size={12}/>, 'Departure': <I.Plane size={12}/>,
    }[p.cat] || <I.MapPin size={12}/>;
    const hasDocs = p.docs && p.docs.length > 0;
    return (
      <div
        className={`place ${p.state || ''} ${expanded ? 'open' : ''}`}
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <div className="when">{p.time}{p.state === 'now' ? ' · NOW' : ''}</div>
        <div className="timeline">
          <div className="dot">
            {p.state === 'done' ? <I.Check size={11} /> : p.state === 'now' ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} /> : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />}
          </div>
        </div>
        <div className="info">
          <div className="name">{p.name}</div>
          <div className="sub">
            <span>{catIcon}{p.cat}</span>
            {p.sub && <span style={{ color: 'var(--fg-3)' }}>· {p.sub}</span>}
            {p.confirmation && (
              <span className="conf-pill" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(p.confirmation.code); }} title="Click to copy code">
                <span className="lbl">{p.confirmation.label}</span>
                <span className="code">{p.confirmation.code}</span>
              </span>
            )}
            {hasDocs && !expanded && (
              <span className="attach-chip" title={`${p.docs.length} document${p.docs.length > 1 ? 's' : ''} attached`}>
                <I.Doc size={11}/>{p.docs.length}
              </span>
            )}
          </div>
          {p.note && <div className="note">{p.note}</div>}
          {expanded && hasDocs && (
            <Docs docs={p.docs} onOpen={(d) => onOpenDoc(d, p.name)} />
          )}
          {expanded && (
            <div className="place-actions" onClick={(e) => e.stopPropagation()}>
              <Btn variant="outline" size="sm" icon={<I.MapPin size={12}/>}>Open in map</Btn>
              <Btn variant="outline" size="sm" icon={<I.Edit size={12}/>}>Edit</Btn>
              <Btn variant="ghost" size="sm" icon={<I.Clock size={12}/>}>Reschedule</Btn>
              <div style={{ flex: 1 }} />
              {p.state !== 'done' && <Btn variant="ghost" size="sm" icon={<I.Check size={12}/>}>Mark visited</Btn>}
            </div>
          )}
        </div>
        <div className="ext" onClick={(e) => e.stopPropagation()}>
          <span className="chev"><I.ChevronD size={14}/></span>
          <Btn variant="ghost" size="sm" icon={<I.More size={13}/>} />
        </div>
      </div>
    );
  }

  function TravelLink({ t }) {
    const ico = t.mode === 'Walk' ? '↧'
              : t.mode === 'Train' ? '↧'
              : t.mode === 'Subway' ? '↧'
              : '↧';
    return (
      <div className="travel">
        <div />
        <div className="icon" />
        <div className="text">{t.mode} · {t.detail}</div>
      </div>
    );
  }

  function Day({ d, onOpenDoc }) {
    const [openId, setOpenId] = React.useState(d.today ? (d.places.find(p => p.state === 'now') || {}).id : null);
    return (
      <div className={`day ${d.today ? 'today' : ''}`}>
        <div className="day-head">
          <div>
            <div className="num">DAY {d.n}{d.today ? ' · TODAY' : ''}</div>
            <div className="date">{d.label} · {d.subtitle}</div>
          </div>
          <div className="meta">
            <span><I.MapPin size={12}/>{d.places.length} stops</span>
            {d.today && <Badge variant="solid" dot>Active</Badge>}
          </div>
        </div>
        <div className="day-body">
          {d.places.map((p, i) => (
            <React.Fragment key={p.id || i}>
              <Place
                p={p}
                expanded={openId === (p.id || i)}
                onToggle={() => setOpenId(openId === (p.id || i) ? null : (p.id || i))}
                onOpenDoc={onOpenDoc}
              />
              {p.travel && i < d.places.length - 1 && <TravelLink t={p.travel} />}
            </React.Fragment>
          ))}
          <button className="add-place">
            <span className="ico"><I.Plus size={13}/></span>
            <span>Add a place to day {d.n}</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Side rail ──
  function MiniMap() {
    return (
      <div className="rail-panel">
        <header>
          <span className="t">Today's route</span>
          <span className="x">5 STOPS · 8 KM</span>
        </header>
        <div className="minimap">
          <svg className="path" viewBox="0 0 320 180" preserveAspectRatio="none">
            <path d="M 40 50 L 90 80 L 150 70 L 200 110 L 270 130" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
          </svg>
          <span className="pin ghost" style={{ top: '28%', left: '12%' }} />
          <span className="pin ghost" style={{ top: '44%', left: '28%' }} />
          <span className="pin" style={{ top: '39%', left: '47%' }} />
          <span className="pin ghost" style={{ top: '62%', left: '63%' }} />
          <span className="pin ghost" style={{ top: '72%', left: '85%' }} />
        </div>
        <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--fg-3)' }}>
          <span>You're at <b style={{ color: 'var(--fg)' }}>Hamarikyu</b></span>
          <button className="btn outline sm">Open map</button>
        </div>
      </div>
    );
  }

  function DocsRail() {
    return (
      <div className="rail-panel">
        <header>
          <span className="t">Documents</span>
          <span className="x">{TOKYO_DOCS.filter(d => d.cached).length} / {TOKYO_DOCS.length} OFFLINE</span>
        </header>
        <div className="body">
          {TOKYO_DOCS.slice(0, 5).map((d, i) => (
            <div key={i} className="doc-row">
              <span className="ico"><I.Doc size={14} /></span>
              <span className="info">
                <span className="n">{d.name}</span>
                <span className="s">{d.type}</span>
              </span>
              {d.cached
                ? <span title="Saved offline" aria-label="Saved offline" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:24,height:24,color:'var(--accent)'}}><I.DownloadDone size={16}/></span>
                : <button title="Save offline" aria-label="Save offline" className="btn ghost" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:24,height:24,padding:0,color:'var(--fg-3)'}}><I.Download size={16}/></button>}
            </div>
          ))}
          <button className="btn ghost sm" style={{ marginTop: 8, width: '100%' }}>View all 7 documents →</button>
        </div>
      </div>
    );
  }

  function PackingRail() {
    const done = TOKYO_PACKING.filter(p => p.done).length;
    return (
      <div className="rail-panel">
        <header>
          <span className="t">Packing</span>
          <span className="x">{done} / {TOKYO_PACKING.length} PACKED</span>
        </header>
        <div className="body">
          {TOKYO_PACKING.slice(0, 6).map((p, i) => (
            <div key={i} className={`pack-row ${p.done ? 'done' : ''}`}>
              <span className="check"><I.Check size={10} /></span>
              <span className="name">{p.n}</span>
              <span className="ix">{String(i + 1).padStart(2, '0')}</span>
            </div>
          ))}
          <button className="btn ghost sm" style={{ marginTop: 8, width: '100%' }}>Open packing list →</button>
        </div>
      </div>
    );
  }

  function CollabRail() {
    return (
      <div className="rail-panel">
        <header>
          <span className="t">Collaborators</span>
          <span className="x">2</span>
        </header>
        <div className="body">
          {TOKYO_COLLAB.map((c, i) => (
            <div key={i} className="collab-row">
              <Avatar initials={c.i} style={{ background: c.tint.bg, color: c.tint.fg }} />
              <span className="who">
                <span className="n">{c.n}</span>
                <span className="e">{c.e}</span>
              </span>
              <span className="role">{c.role}</span>
            </div>
          ))}
          <button className="btn outline sm" style={{ marginTop: 10, width: '100%' }}><I.Plus size={13}/>Invite</button>
        </div>
      </div>
    );
  }

  // ── Desktop ──
  function DesktopTripDetail({ dark, onBack }) {
    const [tab, setTab] = React.useState('itin');
    const [viewerDoc, setViewerDoc] = React.useState(null);
    const [viewerEvent, setViewerEvent] = React.useState(null);
    const onOpenDoc = (doc, eventName) => { setViewerDoc(doc); setViewerEvent(eventName); };
    return (
      <div className="td">
        <TripSidebar />
        <div className="td-main scroll">
          <div className="td-hero">
            <div className="crumb-row">
              <button className="btn ghost sm" onClick={onBack}><I.ChevronL size={14}/>Trips</button>
              <span className="sep">/</span>
              <span className="here">Tokyo</span>
              <div className="actions">
                <Btn variant="outline" size="sm" icon={<I.Share size={13}/>}>Share</Btn>
                <Btn variant="outline" size="sm" icon={<I.DownloadDone size={13}/>} title="Saved offline">Offline</Btn>
                <Btn variant="outline" size="sm" icon={<I.More size={13}/>} />
              </div>
            </div>
            <div className="cover">
              <TripCover name="Tokyo" country="Japan" sub="JPN · DAY 5 OF 7" dark={dark} label="ACTIVE TRIP · OFFLINE" hideCity hideMeta />
            </div>
            <div className="scrim" />
            <div className="info">
              <div>
                <div className="where">JAPAN · APR 24 — MAY 1, 2026</div>
                <h1>Tokyo</h1>
                <div className="stats">
                  <span><I.Calendar size={13}/>7 days · day 5 today</span>
                  <span><I.MapPin size={13}/>32 places</span>
                  <span><I.Doc size={13}/>7 docs</span>
                  <span><I.Users size={13}/>2 collaborators</span>
                </div>
              </div>
              <div className="actions" />
            </div>
          </div>

          <div className="td-tabbar">
            <div className="tabs" style={{ borderBottom: 0 }}>
              {[
                { id: 'itin', label: 'Itinerary' },
                { id: 'map',  label: 'Map' },
                { id: 'docs', label: 'Documents' },
                { id: 'pack', label: 'Packing' },
                { id: 'notes', label: 'Notes' },
              ].map(t => (
                <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
              ))}
            </div>
            <div className="grow" />
            <div className="day-pager">
              <button className="btn ghost icon sm"><I.ChevronL size={13}/></button>
              <span>DAY <b>5</b> · APR 28 · TODAY</span>
              <button className="btn ghost icon sm"><I.ChevronR size={13}/></button>
            </div>
          </div>

          <div className="td-body">
            <div className="td-itin scroll">
              {TOKYO_DAYS.map(d => <Day key={d.n} d={d} onOpenDoc={onOpenDoc} />)}
            </div>
            <aside className="td-rail scroll">
              <MiniMap />
              <DocsRail />
              <PackingRail />
              <CollabRail />
            </aside>
          </div>
        </div>
        <DocViewer doc={viewerDoc} eventName={viewerEvent} onClose={() => setViewerDoc(null)} />
      </div>
    );
  }

  // ── Mobile ──
  function MobileTripDetail({ dark, onBack }) {
    const [section, setSection] = React.useState('itin');
    const [dayIdx, setDayIdx] = React.useState(4); // today (zero-indexed)
    const day = TOKYO_DAYS[dayIdx];
    const [openId, setOpenId] = React.useState(() => (day.places.find(p => p.state === 'now') || {}).id);
    const [viewerDoc, setViewerDoc] = React.useState(null);
    const [viewerEvent, setViewerEvent] = React.useState(null);
    const onOpenDoc = (doc, eventName) => { setViewerDoc(doc); setViewerEvent(eventName); };
    React.useEffect(() => {
      // when day changes, default open the "now" event of that day (if any)
      const next = (day.places.find(p => p.state === 'now') || {}).id || null;
      setOpenId(next);
    }, [dayIdx]);

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

        <div className="tdm-hero">
          <div className="cover">
            <TripCover name="Tokyo" country="Japan" sub="JPN · DAY 5 OF 7" dark={dark} label="ACTIVE TRIP" hideCity />
          </div>
          <div className="top">
            <button className="btn-circle" onClick={onBack}><I.ChevronL size={16}/></button>
            <button className="btn-circle"><I.More size={16}/></button>
          </div>
          <div className="info">
            <div className="where">JAPAN · APR 24 — MAY 1</div>
            <h1>Tokyo</h1>
            <div className="stats">
              <span><I.Calendar size={11}/>Day 5 of 7</span>
              <span><I.MapPin size={11}/>32 places</span>
              <span><I.Doc size={11}/>7 docs</span>
            </div>
          </div>
        </div>

        <div className="tdm-section-tabs">
          {[
            { id: 'itin', label: 'Itinerary' },
            { id: 'map',  label: 'Map' },
            { id: 'docs', label: 'Docs' },
            { id: 'pack', label: 'Packing' },
            { id: 'notes', label: 'Notes' },
          ].map(t => (
            <button key={t.id} className={section === t.id ? 'on' : ''} onClick={() => setSection(t.id)}>{t.label}</button>
          ))}
        </div>

        <div className="tdm-day-pager">
          <button className="btn-circle" onClick={() => setDayIdx(Math.max(0, dayIdx - 1))} disabled={dayIdx === 0}><I.ChevronL size={14}/></button>
          <div className="center">
            <div className="d">{day.label.split('·')[0].trim()}</div>
            <div className="n">DAY {day.n}{day.today ? ' · TODAY' : ''} · {day.subtitle.toUpperCase()}</div>
          </div>
          <button className="btn-circle" onClick={() => setDayIdx(Math.min(TOKYO_DAYS.length - 1, dayIdx + 1))} disabled={dayIdx === TOKYO_DAYS.length - 1}><I.ChevronR size={14}/></button>
        </div>

        <div className="tdm-itin scroll">
          {day.places.map((p, i) => {
            const key = p.id || i;
            const isOpen = openId === key;
            const hasDocs = p.docs && p.docs.length > 0;
            return (
              <div
                key={key}
                className={`tdm-place ${p.state || ''} ${isOpen ? 'open' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(isOpen ? null : key)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(isOpen ? null : key); } }}
              >
                <div className="when">{p.time}{p.state === 'now' ? ' · NOW' : ''}</div>
                <div className="timeline">
                  <div className="dot">
                    {p.state === 'done' ? <I.Check size={11} /> : p.state === 'now' ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} /> : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: 0.5 }} />}
                  </div>
                </div>
                <div className="info">
                  <div className="n">{p.name}</div>
                  <div className="s">
                    <span>{p.cat}</span>
                    {p.sub && <span>· {p.sub}</span>}
                    {hasDocs && !isOpen && (
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
                    <div className="note">{p.note}</div>
                  )}
                  {isOpen && hasDocs && (
                    <Docs docs={p.docs} onOpen={(d) => onOpenDoc(d, p.name)} compact />
                  )}
                  {isOpen && (
                    <div className="actions" onClick={(e) => e.stopPropagation()}>
                      <button className="ab"><I.MapPin size={11}/>Map</button>
                      <button className="ab"><I.Edit size={11}/>Edit</button>
                      {p.state !== 'done' && <button className="ab"><I.Check size={11}/>Done</button>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div style={{ padding: '14px 16px' }}>
            <button className="btn outline full sm"><I.Plus size={13}/>Add place to day {day.n}</button>
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

  return { DesktopTripDetail, MobileTripDetail, TripSidebar };
})();

window.Packt_TripDetail = TripDetail;
