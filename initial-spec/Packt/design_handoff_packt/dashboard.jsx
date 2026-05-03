// dashboard.jsx — Dashboard / My Trips (desktop + mobile)

const Dashboard = (() => {
  const I = window.Packt_Icons;
  const { TripCover, SAMPLE_ACTIVE_TRIP, SAMPLE_UPCOMING, SAMPLE_PAST, WORLD_PINS } = window.Packt_Data;
  const { Btn, Badge, Avatar, Input } = window.Packt_Components;
  const { WorldMap } = window.Packt_WorldMap;

  // ── Desktop ─────────────────────────────────────
  function Sidebar({ active = 'trips' }) {
    const items = [
      { id: 'trips',  label: 'Trips',  icon: <I.Suitcase className="ico" />, count: 4 },
      { id: 'search', label: 'Search', icon: <I.Search className="ico" /> },
      { id: 'map',    label: 'Map',    icon: <I.Map className="ico" /> },
      { id: 'world',  label: 'World map', icon: <I.Globe className="ico" /> },
    ];
    const profile = [
      { id: 'profile',  label: 'Profile',  icon: <I.User className="ico" /> },
      { id: 'settings', label: 'Settings', icon: <I.Settings className="ico" /> },
    ];
    return (
      <aside className="side scroll">
        <div className="brand-row">
          <span className="brand-mark" />
          <span className="name">Packt</span>
        </div>

        <h5>Workspace</h5>
        {items.map(it => (
          <div key={it.id} className={`nav-item ${active === it.id ? 'on' : ''}`}>
            {it.icon}
            <span>{it.label}</span>
            {it.count != null && <span className="count">{it.count}</span>}
          </div>
        ))}

        <h5>Pinned trips</h5>
        <div className="nav-item">
          <span style={{ width: 14, height: 14, borderRadius: 3, background: 'oklch(0.85 0.06 8)', flexShrink: 0 }} />
          <span>Tokyo</span>
          <span className="count">D5</span>
        </div>
        <div className="nav-item">
          <span style={{ width: 14, height: 14, borderRadius: 3, background: 'oklch(0.86 0.06 78)', flexShrink: 0 }} />
          <span>Lisbon</span>
          <span className="count">21d</span>
        </div>
        <div className="nav-item">
          <span style={{ width: 14, height: 14, borderRadius: 3, background: 'oklch(0.86 0.06 45)', flexShrink: 0 }} />
          <span>Oaxaca</span>
          <span className="count">92d</span>
        </div>

        <h5>Account</h5>
        {profile.map(it => (
          <div key={it.id} className="nav-item">
            {it.icon}
            <span>{it.label}</span>
          </div>
        ))}

        <div className="footer">
          <Avatar initials="MR" style={{ background: 'oklch(0.86 0.05 8)', color: 'oklch(0.30 0.08 8)' }} />
          <div className="who">
            <div className="n">Maya R.</div>
            <div className="e">maya@packt.local</div>
          </div>
          <button className="btn ghost icon sm" title="Sign out"><I.More size={14} /></button>
        </div>
      </aside>
    );
  }

  function NowCard({ trip, dark, onOpen }) {
    return (
      <div className="now-card">
        <div style={{ minHeight: 220 }}>
          <TripCover name={trip.name} country={trip.country} sub={`${trip.country.toUpperCase()} · DAY ${trip.dayN} OF ${trip.dayTotal}`} dark={dark} label="ACTIVE TRIP" />
        </div>
        <div className="body">
          <div className="hd">
            <div>
              <div className="lab"><span className="led" /> ACTIVE TRIP · DAY {trip.dayN} OF {trip.dayTotal}</div>
              <h2>{trip.name}, {trip.country}</h2>
              <div style={{ color: 'var(--fg-3)', fontSize: 13.5, marginTop: 4 }}>{trip.startDate} — {trip.endDate}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="outline" size="sm" icon={<I.Share size={13}/>} />
              <Btn variant="outline" size="sm" onClick={onOpen}>Open trip</Btn>
              <Btn variant="primary" size="sm"><I.MapPin size={13}/>Today</Btn>
            </div>
          </div>

          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span title="Saved offline" aria-label="Saved offline" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: 'var(--accent)', padding: '4px 9px', background: 'var(--accent-soft)', borderRadius: 999 }}>
              <I.DownloadDone size={13} />
              Offline
            </span>
            <Badge>9 places</Badge>
            <Badge>12 docs</Badge>
            <span style={{ flex: 1 }} />
            <span className="avatar-stack">
              <Avatar size="sm" initials="MR" style={{ background: 'oklch(0.86 0.05 8)', color: 'oklch(0.3 0.08 8)' }} />
              <Avatar size="sm" initials="JK" style={{ background: 'oklch(0.86 0.05 200)', color: 'oklch(0.3 0.05 200)' }} />
            </span>
          </div>

          <div className="meta-grid">
            <div>
              <div className="l">Where</div>
              <div className="v">Tokyo Bay area<span className="small">Hamarikyu now</span></div>
            </div>
            <div>
              <div className="l">Weather</div>
              <div className="v">19°C clear<span className="small">light wind · 11 km/h</span></div>
            </div>
            <div>
              <div className="l">Local time</div>
              <div className="v">14:08<span className="small">UTC+9 · JST</span></div>
            </div>
            <div>
              <div className="l">Next event</div>
              <div className="v">17:30<span className="small">Shibuya Sky · 3.4 km</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function DayRibbon({ trip, onOpenDay }) {
    return (
      <div className="day-ribbon">
        <button className="when as-btn" onClick={() => onOpenDay && onOpenDay()} title="Open day planner">
          <div className="d">{trip.todayDate}</div>
          <div className="m">{trip.todayMonth} · DAY {trip.dayN}</div>
        </button>
        <div className="events scroll">
          {trip.events.map((ev, i) => (
            <React.Fragment key={i}>
              <button
                className={`ev as-btn ${ev.state === 'now' ? 'now' : ''}`}
                style={{ opacity: ev.state === 'done' ? 0.55 : 1 }}
                onClick={() => onOpenDay && onOpenDay(ev.id)}
                title={`Open ${ev.name} in day planner`}
              >
                <div className="t">{ev.time}{ev.state === 'now' ? ' · NOW' : ev.state === 'done' ? ' · DONE' : ''}</div>
                <div className="n">{ev.name}</div>
                <div className="cat">{ev.cat}</div>
              </button>
              {i < trip.events.length - 1 && <I.ChevronR className="arrow" />}
            </React.Fragment>
          ))}
          <button className="btn ghost icon sm" style={{ flexShrink: 0 }}><I.Plus size={14}/></button>
        </div>
      </div>
    );
  }

  function TripCard({ trip, dark }) {
    return (
      <div className="trip-card">
        <TripCover name={trip.name} country={trip.country} sub={`${trip.country.toUpperCase()} · ${trip.days} DAYS`} dark={dark} label="UPCOMING" />
        <div className="body">
          <div className="hd">
            <div>
              <div className="name">{trip.name}, {trip.country}</div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                {trip.startDate} — {trip.endDate}
              </div>
            </div>
            <Badge variant="soft">in {trip.inDays}d</Badge>
          </div>
          <div className="meta">
            <span><I.Calendar size={13}/>{trip.days} days</span>
            <span><I.Doc size={13}/>{trip.docs} docs</span>
            <span><I.Users size={13}/>{trip.collaborators.length}</span>
          </div>
          <div className="foot">
            <span className="avatar-stack">
              {trip.collaborators.map((c, i) => (
                <Avatar key={i} size="sm" initials={c} style={{ background: 'var(--surface-2)' }} />
              ))}
            </span>
            <span style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Open →</span>
          </div>
        </div>
      </div>
    );
  }

  function NewTripCard() {
    return (
      <button className="new-trip">
        <span className="ico"><I.Plus size={18}/></span>
        <span className="t">Start a new trip</span>
        <span className="s">A blank itinerary, ready when you are.</span>
      </button>
    );
  }

  function PastTripsList({ rows, dark }) {
    return (
      <div className="past-list">
        {rows.map((r, i) => (
          <div key={i} className="past-row">
            <div className="thumb">
              <TripCover name={r.name} country={r.country} sub="" dark={dark} label="" />
            </div>
            <div>
              <div className="name">{r.name}, {r.country}</div>
              <div className="where">{r.country.toUpperCase()}</div>
            </div>
            <div className="date">{r.date}</div>
            <div className="days">{r.days} DAYS</div>
            <Badge variant="outline">Past</Badge>
            <button className="btn ghost icon sm"><I.More size={14}/></button>
          </div>
        ))}
      </div>
    );
  }

  function WorldMini() {
    return (
      <div className="world-mini">
        <div className="stats">
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>Travel history</div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>Across 9 cities and 8 countries.</div>
          </div>
          <div className="row">
            <span className="l">Cities</span>
            <span className="v">9</span>
          </div>
          <div className="row">
            <span className="l">Countries</span>
            <span className="v">8</span>
          </div>
          <div className="row">
            <span className="l">Days</span>
            <span className="v">42</span>
          </div>
          <button className="btn outline sm" style={{ marginTop: 4, width: '100%' }}>Open world map →</button>
        </div>
      </div>
    );
  }

  function DesktopDashboard({ dark, onOpenTrip, onOpenDay }) {
    return (
      <div className="dash">
        <Sidebar active="trips" />
        <div className="main scroll">
          <div className="topbar">
            <div>
              <div className="crumb">My trips</div>
              <div className="sub">04.28.2026 · 4 trips · 5 past</div>
            </div>
            <span style={{ flex: 1 }} />
            <div style={{ width: 280 }}>
              <Input icon={<I.Search size={14} />} placeholder="Search trips, places, docs…" />
            </div>
            <Btn variant="outline" size="sm" icon={<I.Bell size={14}/>} />
            <Btn variant="primary" size="sm"><I.Plus size={14}/>New trip</Btn>
          </div>

          <div className="body">
            <NowCard trip={SAMPLE_ACTIVE_TRIP} dark={dark} onOpen={onOpenTrip} />
            <DayRibbon trip={SAMPLE_ACTIVE_TRIP} onOpenDay={onOpenDay} />

            <div className="sec-head">
              <h2>Upcoming</h2>
              <span className="count">3 TRIPS · NEXT IN 21 DAYS</span>
              <span style={{ flex: 1 }} />
              <div className="actions">
                <div className="segmented">
                  <button className="on">Cards</button>
                  <button>List</button>
                </div>
                <Btn variant="ghost" size="sm" icon={<I.Sort size={13}/>}>Date</Btn>
              </div>
            </div>
            <div className="trip-grid">
              {SAMPLE_UPCOMING.map(t => <div key={t.id} onClick={onOpenTrip} style={{cursor:'default'}}><TripCard trip={t} dark={dark} /></div>)}
              <NewTripCard />
            </div>

            <div className="sec-head">
              <h2>Travel history</h2>
              <span className="count">8 COUNTRIES · 42 DAYS LIFETIME</span>
            </div>
            <WorldMini />

            <div className="sec-head">
              <h2>Past trips</h2>
              <span className="count">5 OF 5</span>
              <span style={{ flex: 1 }} />
              <div className="actions">
                <Btn variant="ghost" size="sm" icon={<I.Filter size={13}/>}>Filter</Btn>
              </div>
            </div>
            <PastTripsList rows={SAMPLE_PAST} dark={dark} />
          </div>
        </div>
      </div>
    );
  }

  // ── Mobile ──────────────────────────────────────
  function MobileDashboard({ dark, onOpenTrip, onOpenDay }) {
    const [tab, setTab] = React.useState('Active');
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

        <div className="mob-header">
          <div>
            <h1>Trips</h1>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 4 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#1c8a5b', marginRight: 6, verticalAlign: 'middle' }} />
              Synced offline · 4 trips
            </div>
          </div>
          <div className="actions">
            <Btn variant="ghost" size="sm" icon={<I.Search size={15}/>} />
            <Btn variant="primary" size="sm" icon={<I.Plus size={15}/>} />
          </div>
        </div>

        <div className="mob-tabs">
          {['Active', 'Upcoming', 'Past'].map(t => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="mob-body scroll">
          {tab === 'Active' && (
            <>
              <div className="now-mob">
                <TripCover name={SAMPLE_ACTIVE_TRIP.name} country={SAMPLE_ACTIVE_TRIP.country} sub="JPN · DAY 5 OF 7" dark={dark} label="ACTIVE" />
                <div className="info">
                  <div className="lab"><span className="led" /> Day 5 of 7 · 14:08 JST</div>
                  <h2>Tokyo, Japan</h2>
                  <div className="meta">
                    <span><I.Calendar size={12}/>Apr 24 — May 1</span>
                    <span><I.Users size={12}/>2</span>
                    <span><I.Cloud size={12}/>19°C</span>
                  </div>
                </div>
              </div>
              <div className="mob-day-strip">
                <div className="hd">
                  <span className="t">TODAY · APR 28</span>
                  <span className="d">5 stops</span>
                </div>
                {SAMPLE_ACTIVE_TRIP.events.map((ev, i) => (
                  <button key={i} className={`row as-btn ${ev.state === 'now' ? 'now' : ''}`} style={{ opacity: ev.state === 'done' ? 0.5 : 1 }} onClick={() => onOpenDay && onOpenDay(ev.id)}>
                    <span className="when">{ev.time}</span>
                    <span className="what" style={{ textDecoration: ev.state === 'done' ? 'line-through' : 'none' }}>{ev.name}</span>
                    <span className="cat">{ev.cat}</span>
                  </button>
                ))}
              </div>
              <button className="btn outline full" style={{ marginBottom: 14 }} onClick={onOpenTrip}>Open trip →</button>
            </>
          )}

          {tab === 'Upcoming' && (
            <div className="mob-trip-list">
              {SAMPLE_UPCOMING.map(t => (
                <div key={t.id} className="mob-trip-card">
                  <TripCover name={t.name} country={t.country} sub="" dark={dark} label="" />
                  <div className="info">
                    <div className="name">{t.name}, {t.country}</div>
                    <div className="where">{t.country.toUpperCase()} · {t.days} DAYS</div>
                    <div className="when">{t.startDate} — {t.endDate}</div>
                    <div className="badges">
                      <Badge variant="soft">in {t.inDays}d</Badge>
                      {t.docs > 0 ? <Badge variant="success" dot>{t.docs} docs</Badge> : <Badge variant="warning" dot>no docs</Badge>}
                    </div>
                  </div>
                </div>
              ))}
              <button className="new-trip" style={{ minHeight: 100 }}>
                <span className="ico"><I.Plus size={18}/></span>
                <span className="t">Start a new trip</span>
              </button>
            </div>
          )}

          {tab === 'Past' && (
            <div className="mob-trip-list">
              {SAMPLE_PAST.map((t, i) => (
                <div key={i} className="mob-trip-card">
                  <TripCover name={t.name} country={t.country} sub="" dark={dark} label="" />
                  <div className="info">
                    <div className="name">{t.name}, {t.country}</div>
                    <div className="where">{t.country.toUpperCase()} · {t.days} DAYS</div>
                    <div className="when">{t.date}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mob-tabbar">
          <button className="on"><I.Suitcase /><span>Trips</span></button>
          <button><I.Search /><span>Search</span></button>
          <button><I.Globe /><span>Map</span></button>
          <button><I.User /><span>Profile</span></button>
        </div>
      </div>
    );
  }

  return { DesktopDashboard, MobileDashboard };
})();

window.Packt_Dashboard = Dashboard;
