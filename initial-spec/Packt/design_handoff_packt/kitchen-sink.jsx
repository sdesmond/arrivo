// kitchen-sink.jsx — Component kitchen sink for Packt
// Demonstrates: tokens, type, color, primitives, patterns, accent A/B preview

const KitchenSink = (() => {
  const I = window.Packt_Icons;
  const { TripCover } = window.Packt_Data;

  // ── Atoms (re-exported as window.Packt_Components for dashboard reuse) ──
  function Btn({ variant = 'secondary', size, icon, children, ...rest }) {
    const cls = ['btn', variant, size && size, icon && !children && 'icon'].filter(Boolean).join(' ');
    return <button className={cls} {...rest}>{icon}{children}</button>;
  }
  function Badge({ variant, dot, children }) {
    const cls = ['badge', variant, dot && 'dot'].filter(Boolean).join(' ');
    return <span className={cls}>{children}</span>;
  }
  function Switch({ on, onToggle }) {
    return <button className={`switch ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on} />;
  }
  function Check({ on, onToggle, children }) {
    return (
      <button className={`check ${on ? 'on' : ''}`} onClick={onToggle}>
        <span className="box"><I.Check size={11} /></span>
        {children}
      </button>
    );
  }
  function Radio({ on, onSelect, children }) {
    return <button className={`radio ${on ? 'on' : ''}`} onClick={onSelect}><span className="ring" />{children}</button>;
  }
  function Avatar({ initials, size, style }) {
    return <span className={`avatar ${size || ''}`} style={style}>{initials}</span>;
  }
  function Input({ icon, ...rest }) {
    if (!icon) return <input className="input" {...rest} />;
    return (
      <div className="input-with-icon">
        {icon}
        <input className="input" {...rest} />
      </div>
    );
  }

  // ── Sub-sections ──
  function HeaderRow({ ix, title, children, extra }) {
    return (
      <section className="ks-section">
        <header>
          <h2>{title}</h2>
          <span className="ix">{ix}{extra ? ` · ${extra}` : ''}</span>
        </header>
        {children}
      </section>
    );
  }

  function ColorTokens({ accent }) {
    const swatches = [
      { name: '--bg',         val: 'var(--bg)' },
      { name: '--surface',    val: 'var(--surface)' },
      { name: '--surface-2',  val: 'var(--surface-2)' },
      { name: '--surface-3',  val: 'var(--surface-3)' },
      { name: '--fg',         val: 'var(--fg)' },
      { name: '--fg-2',       val: 'var(--fg-2)' },
      { name: '--fg-3',       val: 'var(--fg-3)' },
      { name: '--fg-4',       val: 'var(--fg-4)' },
      { name: '--accent',     val: 'var(--accent)' },
      { name: '--accent-soft',val: 'var(--accent-soft)' },
      { name: '--accent-fg',  val: 'var(--accent-fg)' },
      { name: '--accent-ink', val: 'var(--accent-ink)' },
    ];
    return (
      <div className="swatch-grid">
        {swatches.map(s => (
          <div key={s.name} className="swatch">
            <div className="chip" style={{ background: s.val }} />
            <div className="name">{s.name}</div>
            <div className="val">token</div>
          </div>
        ))}
      </div>
    );
  }

  function AccentPreview({ accent, setAccent }) {
    return (
      <div className="ks-grid">
        {[
          { id: 'teal',  name: 'B — Teal · selected',  desc: 'Modern, calm, considered. Locked in as Packt\u2019s primary accent.', hex: '#0E8B80' },
          { id: 'coral', name: 'A — Coral · archived', desc: 'Energetic, bold, warm. Available as alternate accent.', hex: '#F04A3B' },
        ].map(opt => (
          <div key={opt.id} className="ks-card" data-accent={opt.id} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
              <div>
                <div className="ks-label" style={{ marginBottom: 6 }}>Accent variant</div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>{opt.name}</h3>
                <p style={{ color: 'var(--fg-3)', fontSize: 12.5, marginTop: 4 }}>{opt.desc}</p>
              </div>
              <Btn variant={accent === opt.id ? 'primary' : 'outline'} size="sm" onClick={() => setAccent(opt.id)}>
                {accent === opt.id ? 'In use' : 'Try it'}
              </Btn>
            </div>
            {/* Mini preview: button, badge, link, swatches */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <button className="btn primary" style={{ background: opt.hex, color: '#fff' }}>New trip</button>
              <span className="badge" style={{ background: opt.id === 'coral' ? '#fde7e3' : '#d6efec', color: opt.id === 'coral' ? '#8a1d12' : '#0a4a44' }}>Active</span>
              <span style={{ color: opt.hex, fontSize: 13.5, fontWeight: 500 }}>tokyo.itinerary</span>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: opt.hex, boxShadow: `0 0 0 4px ${opt.id === 'coral' ? '#fde7e3' : '#d6efec'}` }} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 0.7, 0.45, 0.25, 0.12].map((a, i) => (
                <div key={i} style={{ flex: 1, height: 22, borderRadius: 4, background: opt.hex, opacity: a }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function TypeSpecimen() {
    return (
      <div className="ks-card">
        <div className="type-row"><span className="name">display</span><span className="size">42 / 700</span><span className="demo" style={{ fontFamily: 'var(--font-heading)', fontSize: 42, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.05 }}>Plan trips that travel with you.</span></div>
        <div className="type-row"><span className="name">h1</span><span className="size">32 / 700</span><span className="demo" style={{ fontFamily: 'var(--font-heading)', fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' }}>Tokyo, Japan</span></div>
        <div className="type-row"><span className="name">h2</span><span className="size">22 / 600</span><span className="demo" style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em' }}>Day 5 — Hamarikyu Gardens</span></div>
        <div className="type-row"><span className="name">h3</span><span className="size">17 / 600</span><span className="demo" style={{ fontFamily: 'var(--font-heading)', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>Reservations & documents</span></div>
        <div className="type-row"><span className="name">body lg</span><span className="size">16 / 400</span><span className="demo" style={{ fontSize: 16, lineHeight: 1.6 }}>Self-hosted travel planner with offline-first access and a personal world travel map.</span></div>
        <div className="type-row"><span className="name">body</span><span className="size">14 / 400</span><span className="demo" style={{ fontSize: 14, lineHeight: 1.55 }}>Plan trips, store travel docs, and track travel history — privacy-first.</span></div>
        <div className="type-row"><span className="name">caption</span><span className="size">12.5 / 500</span><span className="demo" style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>Synced 2 minutes ago · 7 trips offline</span></div>
        <div className="type-row"><span className="name">mono</span><span className="size">11 / 400</span><span className="demo" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>04.28.2026 · TYO · UTC+9</span></div>
      </div>
    );
  }

  function ButtonsCard() {
    return (
      <div className="ks-card">
        <div className="ks-label">Buttons · variants × sizes</div>
        <div className="ks-stack">
          <div className="ks-row">
            <Btn variant="primary"><I.Plus size={14}/>New trip</Btn>
            <Btn variant="secondary">Edit</Btn>
            <Btn variant="outline">Cancel</Btn>
            <Btn variant="ghost">Skip</Btn>
            <Btn variant="danger">Delete trip</Btn>
          </div>
          <div className="ks-row">
            <Btn variant="primary" size="lg"><I.Plus size={15}/>New trip</Btn>
            <Btn variant="primary">Default</Btn>
            <Btn variant="primary" size="sm">Small</Btn>
            <Btn variant="outline" size="sm" icon={<I.Filter size={13}/>} />
            <Btn variant="outline" icon={<I.More size={14}/>} />
            <Btn variant="primary" disabled>Disabled</Btn>
          </div>
        </div>
      </div>
    );
  }

  function BadgesCard() {
    return (
      <div className="ks-card">
        <div className="ks-label">Badges · status</div>
        <div className="ks-row">
          <Badge variant="solid" dot>Active trip</Badge>
          <Badge variant="soft">Day 5 / 7</Badge>
          <Badge variant="success" dot>Synced offline</Badge>
          <Badge variant="warning" dot>3 docs missing</Badge>
          <Badge variant="outline">Upcoming</Badge>
          <Badge>Past</Badge>
        </div>
      </div>
    );
  }

  function FormCard() {
    const [v, set] = React.useState({
      name: 'Lisbon weekend',
      dest: 'Lisbon, Portugal',
      bio: '',
      offline: true,
      remind: false,
      density: 'comfortable',
      visibility: 'private',
    });
    return (
      <div className="ks-card">
        <div className="ks-label">Forms · inputs, switches, radios</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="field">
            <label>Trip name</label>
            <Input value={v.name} onChange={e => set({...v, name: e.target.value})} />
          </div>
          <div className="field">
            <label>Destination</label>
            <Input icon={<I.MapPin size={14} />} value={v.dest} onChange={e => set({...v, dest: e.target.value})} />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Search places</label>
            <Input icon={<I.Search size={14} />} placeholder="Find a restaurant, hotel, or attraction…" />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Notes</label>
            <textarea className="textarea" placeholder="Things to remember…" rows={3} value={v.bio} onChange={e => set({...v, bio: e.target.value})} />
            <span className="hint">Saved locally — synced when online.</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Save for offline</div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>Download maps, docs, and itinerary.</div>
            </div>
            <Switch on={v.offline} onToggle={() => set({...v, offline: !v.offline})} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>Day-of reminders</div>
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>Notify 30 min before each event.</div>
            </div>
            <Switch on={v.remind} onToggle={() => set({...v, remind: !v.remind})} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="ks-label" style={{ marginBottom: 8 }}>Density</div>
          <div className="segmented">
            {['compact', 'comfortable', 'roomy'].map(o => (
              <button key={o} className={v.density === o ? 'on' : ''} onClick={() => set({...v, density: o})}>{o}</button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div className="ks-label" style={{ marginBottom: 8 }}>Sharing</div>
          <div className="radio-group">
            <Radio on={v.visibility === 'private'}    onSelect={() => set({...v, visibility: 'private'})}>Private to me</Radio>
            <Radio on={v.visibility === 'shared'}     onSelect={() => set({...v, visibility: 'shared'})}>Shared with collaborators</Radio>
            <Radio on={v.visibility === 'public'}     onSelect={() => set({...v, visibility: 'public'})}>Public read-only link</Radio>
          </div>
        </div>
      </div>
    );
  }

  function CheckboxCard() {
    const [items, setItems] = React.useState([
      { t: 'Passport', on: true  },
      { t: 'Power adapter (Type A)', on: true },
      { t: 'Rain shell', on: false },
      { t: 'Pasmo card', on: false },
      { t: 'Cash (¥)', on: false },
    ]);
    return (
      <div className="ks-card">
        <div className="ks-label">Packing checklist · checkboxes</div>
        <div className="ks-stack">
          {items.map((it, i) => (
            <Check key={i} on={it.on} onToggle={() => {
              const next = [...items];
              next[i] = { ...it, on: !it.on };
              setItems(next);
            }}>
              <span style={{ textDecoration: it.on ? 'line-through' : 'none', color: it.on ? 'var(--fg-4)' : 'var(--fg)' }}>{it.t}</span>
            </Check>
          ))}
        </div>
      </div>
    );
  }

  function TabsCard() {
    const [tab, setTab] = React.useState('Itinerary');
    return (
      <div className="ks-card">
        <div className="ks-label">Tabs · navigation</div>
        <div className="tabs">
          {['Itinerary', 'Map', 'Docs', 'Packing', 'Notes'].map(t => (
            <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <p style={{ marginTop: 14, fontSize: 13, color: 'var(--fg-3)' }}>Showing: <b style={{ color: 'var(--fg)' }}>{tab}</b></p>
      </div>
    );
  }

  function AvatarCard() {
    return (
      <div className="ks-card">
        <div className="ks-label">Avatars · single + stacked</div>
        <div className="ks-row" style={{ gap: 16 }}>
          <Avatar size="sm" initials="MR" style={{ background: '#fde7e3', color: '#8a1d12' }} />
          <Avatar initials="MR" />
          <Avatar size="lg" initials="JK" style={{ background: '#d6efec', color: '#0a4a44' }} />
          <span className="avatar-stack">
            <Avatar initials="MR" style={{ background: '#fde7e3', color: '#8a1d12' }} />
            <Avatar initials="JK" style={{ background: '#d6efec', color: '#0a4a44' }} />
            <Avatar initials="AC" style={{ background: 'var(--surface-2)' }} />
            <Avatar initials="+2" style={{ background: 'var(--surface-3)', color: 'var(--fg-2)' }} />
          </span>
        </div>
      </div>
    );
  }

  function ToastsCard() {
    return (
      <div className="ks-card">
        <div className="ks-label">Toasts & tooltips</div>
        <div className="ks-stack">
          <div className="ks-row">
            <span className="toast"><I.Check className="ico" size={16} /> Trip saved offline</span>
          </div>
          <div className="ks-row">
            <span className="toast"><I.WifiOff className="ico" size={16} /> Working offline · syncs when online</span>
          </div>
          <div className="ks-row" style={{ gap: 28, marginTop: 8 }}>
            <span className="tooltip">Add place</span>
            <span className="tooltip">Day 5 of 7</span>
            <span className="tooltip">Available offline</span>
          </div>
        </div>
      </div>
    );
  }

  function DialogCard() {
    return (
      <div className="ks-card" style={{ background: 'var(--surface)' }}>
        <div className="ks-label">Dialog · destructive confirmation</div>
        <div className="dialog-shell">
          <h3>Delete “Lisbon weekend”?</h3>
          <p>This trip and its documents will be removed from this device. Synced copies on other devices remain.</p>
          <div className="actions">
            <button className="btn ghost">Cancel</button>
            <button className="btn danger">Delete trip</button>
          </div>
        </div>
      </div>
    );
  }

  function NavPatternCard() {
    return (
      <div className="ks-card">
        <div className="ks-label">Navigation · sidebar item states</div>
        <div className="ks-stack" style={{ gap: 2 }}>
          <span className="demo-sidebar-item on"><I.Suitcase className="ico" /> Trips <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)' }}>4</span></span>
          <span className="demo-sidebar-item"><I.Search className="ico" /> Search</span>
          <span className="demo-sidebar-item"><I.Map className="ico" /> Map</span>
          <span className="demo-sidebar-item"><I.Globe className="ico" /> World map</span>
          <span className="demo-sidebar-item"><I.User className="ico" /> Profile</span>
        </div>
      </div>
    );
  }

  function CoverCard() {
    return (
      <div className="ks-card">
        <div className="ks-label">Trip covers · destination-tinted placeholders</div>
        <p style={{ fontSize: 12.5, color: 'var(--fg-3)', marginBottom: 14 }}>Honest placeholder pattern. Production replaces these with location-keyed photos.</p>
        <div className="kc-cover-demo">
          <TripCover name="Tokyo" country="Japan" sub="JPN · 7 days" />
          <TripCover name="Lisbon" country="Portugal" sub="PRT · 4 days" />
          <TripCover name="Reykjavik" country="Iceland" sub="ISL · 8 days" />
        </div>
      </div>
    );
  }

  function SpacingCard() {
    const tokens = [
      ['--radius-sm', '6px'], ['--radius', '10px'], ['--radius-lg', '14px'], ['--radius-xl', '20px'],
    ];
    return (
      <div className="ks-card">
        <div className="ks-label">Radii</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          {tokens.map(([n, v]) => (
            <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 56, height: 56, background: 'var(--surface-2)', borderRadius: v, border: '1px solid var(--line)' }} />
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)' }}>{n}</code>
              <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-4)' }}>{v}</code>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function OfflineCard() {
    return (
      <div className="ks-card">
        <div className="ks-label">Offline state · invisible-by-default</div>
        <p style={{ fontSize: 12.5, color: 'var(--fg-3)', marginBottom: 14 }}>Trip content reads identically online or offline. Only live-data features (search, place lookup) show a quiet hint.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="offline-pill" style={{ margin: 0 }}>
            <span className="led" /> All trips synced · 2 min ago
          </div>
          <div className="offline-pill" style={{ margin: 0 }}>
            <span className="led warn" /> Offline · 7 trips available · syncs when online
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)', fontSize: 12.5, color: 'var(--fg-3)' }}>
            <I.Search size={14} />
            <span>Place search · <b style={{ color: 'var(--fg)' }}>connect to look up new places</b></span>
          </div>
        </div>
      </div>
    );
  }

  function KitchenSinkRoot({ accent, setAccent }) {
    return (
      <div className="ks">
        <aside className="ks-nav scroll">
          <h4>Foundations</h4>
          <a href="#tokens">Color tokens</a>
          <a href="#accent">Accent A / B</a>
          <a href="#type">Typography</a>
          <a href="#radii">Radii</a>
          <a href="#covers">Trip covers</a>
          <h4>Primitives</h4>
          <a href="#buttons">Buttons</a>
          <a href="#badges">Badges</a>
          <a href="#forms">Forms</a>
          <a href="#checks">Checkboxes</a>
          <a href="#tabs">Tabs</a>
          <a href="#avatars">Avatars</a>
          <h4>Patterns</h4>
          <a href="#nav">Navigation</a>
          <a href="#dialog">Dialog</a>
          <a href="#toast">Toast & Tooltip</a>
          <a href="#offline">Offline state</a>
        </aside>
        <main className="ks-main scroll">
          <div className="ks-hero">
            <div>
              <div className="meta">PACKT · DESIGN SYSTEM v0.1 · 2026.04.28</div>
              <h1 style={{ marginTop: 8 }}>Component kitchen sink.</h1>
              <p>The full set of primitives Packt uses across every screen. Two accent variants are previewed below — pick one before committing.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              <span className="badge soft">Build order · 1 of 4</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-4)', letterSpacing: '0.04em' }}>NEXT → DASHBOARD</span>
            </div>
          </div>

          <span id="tokens" />
          <HeaderRow ix="01" title="Color tokens" extra="theme-aware">
            <ColorTokens accent={accent} />
          </HeaderRow>

          <span id="accent" />
          <HeaderRow ix="02" title="Accent · B teal selected" extra="A coral archived as alternate">
            <AccentPreview accent={accent} setAccent={setAccent} />
          </HeaderRow>

          <span id="type" />
          <HeaderRow ix="03" title="Typography" extra="Manrope display · DM Sans body">
            <TypeSpecimen />
          </HeaderRow>

          <span id="radii" />
          <HeaderRow ix="04" title="Radii">
            <SpacingCard />
          </HeaderRow>

          <span id="covers" />
          <HeaderRow ix="05" title="Trip covers" extra="placeholder system">
            <CoverCard />
          </HeaderRow>

          <span id="buttons" />
          <HeaderRow ix="06" title="Buttons">
            <ButtonsCard />
          </HeaderRow>

          <span id="badges" />
          <HeaderRow ix="07" title="Badges">
            <BadgesCard />
          </HeaderRow>

          <span id="forms" />
          <HeaderRow ix="08" title="Forms">
            <FormCard />
          </HeaderRow>

          <span id="checks" />
          <HeaderRow ix="09" title="Checkboxes" extra="packing list">
            <div className="ks-grid">
              <CheckboxCard />
              <AvatarCard />
            </div>
          </HeaderRow>

          <span id="tabs" />
          <HeaderRow ix="10" title="Tabs">
            <TabsCard />
          </HeaderRow>

          <span id="nav" />
          <HeaderRow ix="11" title="Navigation patterns">
            <NavPatternCard />
          </HeaderRow>

          <span id="dialog" />
          <HeaderRow ix="12" title="Dialog">
            <DialogCard />
          </HeaderRow>

          <span id="toast" />
          <HeaderRow ix="13" title="Toast & Tooltip">
            <ToastsCard />
          </HeaderRow>

          <span id="offline" />
          <HeaderRow ix="14" title="Offline state" extra="invisible-by-default">
            <OfflineCard />
          </HeaderRow>
        </main>
      </div>
    );
  }

  return { KitchenSinkRoot, Btn, Badge, Switch, Check, Radio, Avatar, Input };
})();

window.Packt_Components = KitchenSink;
window.Packt_KitchenSink = KitchenSink.KitchenSinkRoot;
