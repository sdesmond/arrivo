// icons.jsx — minimal icon set used across Packt
// Stroke icons, 1.6px weight, currentColor

const Icon = ({ children, size = 16, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
);

const I = {
  Suitcase: (p) => (<Icon {...p}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/></Icon>),
  Search:   (p) => (<Icon {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>),
  Map:      (p) => (<Icon {...p}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></Icon>),
  Globe:    (p) => (<Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></Icon>),
  User:     (p) => (<Icon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></Icon>),
  Settings: (p) => (<Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></Icon>),
  Plus:     (p) => (<Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>),
  Calendar: (p) => (<Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></Icon>),
  MapPin:   (p) => (<Icon {...p}><path d="M12 22s7-7.6 7-13a7 7 0 1 0-14 0c0 5.4 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></Icon>),
  Users:    (p) => (<Icon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M22 19.5A5 5 0 0 0 17 15"/></Icon>),
  Clock:    (p) => (<Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>),
  Doc:      (p) => (<Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></Icon>),
  List:     (p) => (<Icon {...p}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></Icon>),
  Home:     (p) => (<Icon {...p}><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z"/></Icon>),
  Plane:    (p) => (<Icon {...p}><path d="M21 15.5 14 12V5.5a2 2 0 0 0-4 0V12L3 15.5V18l7-2v4l-2 1v1l4-1 4 1v-1l-2-1v-4l7 2z"/></Icon>),
  Bed:      (p) => (<Icon {...p}><path d="M3 17V8M3 17h18M3 17v3M21 17v3M21 17v-4a3 3 0 0 0-3-3H10v7"/><circle cx="7" cy="12" r="2"/></Icon>),
  Coffee:   (p) => (<Icon {...p}><path d="M3 9h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M17 11h2a2 2 0 0 1 0 4h-2M7 5V3M11 5V3M15 5V3"/></Icon>),
  Camera:   (p) => (<Icon {...p}><path d="M3 8h3l2-2h8l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/></Icon>),
  Wifi:     (p) => (<Icon {...p}><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/></Icon>),
  WifiOff:  (p) => (<Icon {...p}><path d="M3 3l18 18"/><path d="M9.5 17a3.5 3.5 0 0 1 5 0"/><path d="M5 13a10 10 0 0 1 4-2.5M19 13a10 10 0 0 0-7-2.7"/><circle cx="12" cy="20" r="1" fill="currentColor"/></Icon>),
  Filter:   (p) => (<Icon {...p}><path d="M3 5h18l-7 9v6l-4-2v-4z"/></Icon>),
  Sort:     (p) => (<Icon {...p}><path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4"/></Icon>),
  ChevronR: (p) => (<Icon {...p}><path d="m9 6 6 6-6 6"/></Icon>),
  ChevronL: (p) => (<Icon {...p}><path d="m15 6-6 6 6 6"/></Icon>),
  ChevronD: (p) => (<Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>),
  More:     (p) => (<Icon {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></Icon>),
  Check:    (p) => (<Icon {...p}><path d="m4 12 5 5L20 6"/></Icon>),
  X:        (p) => (<Icon {...p}><path d="M6 6l12 12M18 6 6 18"/></Icon>),
  Bell:     (p) => (<Icon {...p}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8z"/><path d="M10 21a2 2 0 0 0 4 0"/></Icon>),
  Sun:      (p) => (<Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></Icon>),
  Moon:     (p) => (<Icon {...p}><path d="M21 13a8 8 0 1 1-10-10 7 7 0 0 0 10 10z"/></Icon>),
  Cloud:    (p) => (<Icon {...p}><path d="M7 18a4 4 0 0 1-1-7.9 6 6 0 0 1 11.5 1.4A4 4 0 0 1 17 18z"/></Icon>),
  Star:     (p) => (<Icon {...p}><path d="m12 3 2.7 5.5 6.3.9-4.5 4.4 1 6.2-5.5-2.9L6.5 20l1-6.2L3 9.4l6.3-.9z"/></Icon>),
  Pin:      (p) => (<Icon {...p}><path d="M12 22s7-7.6 7-13a7 7 0 1 0-14 0c0 5.4 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></Icon>),
  Edit:     (p) => (<Icon {...p}><path d="m4 20 4-1 11-11-3-3L5 16zM14 5l3 3"/></Icon>),
  Share:    (p) => (<Icon {...p}><circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m8 11 7-4M8 13l7 4"/></Icon>),
  Download: (p) => (<Icon {...p}><path d="M12 4v12M6 12l6 6 6-6M4 20h16"/></Icon>),
  DownloadDone: (p) => (<Icon {...p}><path d="m6 9 5 5 8-9"/><path d="M4 20h16"/></Icon>),
  Upload:   (p) => (<Icon {...p}><path d="M12 20V8M6 12l6-6 6 6M4 20h16"/></Icon>),
};

window.Packt_Icons = I;
