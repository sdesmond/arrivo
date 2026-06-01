export const E2E_USER = {
  email: "e2e@packt.local",
  name: "E2E Test User",
  initials: "ET",
};

export const E2E_TRIP = {
  name: "E2E Test Trip",
  startDate: "2026-07-01",
  endDate: "2026-07-03",
  coverImageUrl: "graphic:var(--accent-brand)/plane",
};

export const E2E_DELETE_TRIP = {
  name: "E2E Delete Trip",
  startDate: "2026-08-01",
  endDate: "2026-08-03",
};

export const E2E_DAYS = [
  { dayNumber: 1, date: "2026-07-01", label: "Day 1" },
  { dayNumber: 2, date: "2026-07-02", label: "Day 2" },
  { dayNumber: 3, date: "2026-07-03", label: "Day 3" },
];

export const E2E_LOYALTY_NUMBER = {
  programName: "Test Airlines",
  memberNumber: "TA-123456",
  position: 0,
};

export const E2E_COMPANION = {
  name: "Alex Companion",
  age: 30,
  position: 0,
};

export const E2E_DOCUMENT = {
  name: "E2E Boarding Pass",
  kind: "pdf",
  size: "1.2 MB",
  url: "https://example.com/boarding-pass.pdf",
};

// Dedicated document for pick-list tests — keeps "E2E Boarding Pass" read-only
// so documents.feature and event-docs.feature can run in parallel without races.
export const E2E_PICK_DOC = {
  name: "E2E Pick Doc",
  kind: "pdf",
  size: "0.5 MB",
  url: "https://example.com/pick-doc.pdf",
};

export const E2E_EVENT = {
  name: "E2E Event",
  position: 0,
};

export const E2E_EVENT_KEEP = {
  name: "E2E Event Keep",
  position: 1,
};

export const E2E_EVENT_ERASE = {
  name: "E2E Event Erase",
  position: 2,
};

export const E2E_KEEP_DOC = {
  name: "E2E Keep Doc",
  kind: "pdf",
  size: "0.5 MB",
  url: "https://example.com/keep-doc.pdf",
};

export const E2E_ERASE_DOC = {
  name: "E2E Erase Doc",
  kind: "pdf",
  size: "0.5 MB",
  url: "https://example.com/erase-doc.pdf",
};

export const E2E_EVENT_MANAGE = {
  name: "E2E Event Manage",
  position: 3,
};

// Dedicated event for the "User deletes an event" day-planning scenario.
// Reseeded before the test so it doesn't depend on createEvent being called first.
export const E2E_EVENT_DELETE = {
  name: "Event to Remove",
  position: 9,
};

// Dedicated event for the "User sets a time on an event" scenario.
// Reseeded before the test (with null startAt/endAt) so the test only exercises
// the time-picker flow — not the create-event + chained server-action revalidation
// race that previously caused intermittent failures.
export const E2E_EVENT_UNTIMED = {
  name: "Untimed Event",
  position: 10,
};

// Dedicated events for the "User reorders events by dragging" scenario.
// Reseeded at fixed positions so the test starts from a known order regardless
// of prior reorders, and doesn't depend on UI-driven event creation racing
// against revalidation before the drag begins.
export const E2E_EVENT_REORDER_FIRST = {
  name: "Drag First",
  position: 11,
};

export const E2E_EVENT_REORDER_SECOND = {
  name: "Drag Second",
  position: 12,
};

export const E2E_PACKING_ITEMS = [
  { name: "Sunscreen", isLabel: false, done: false, position: 0 },
  { name: "Sunglasses", isLabel: false, done: false, position: 1 },
  { name: "Beach towel", isLabel: false, done: false, position: 2 },
];

export const E2E_PACKING_ITEMS_WITH_LABELS = [
  { name: "Beach day", isLabel: true, done: false, position: 0 },
  { name: "Sunscreen", isLabel: false, done: false, position: 1 },
  { name: "Sunglasses", isLabel: false, done: false, position: 2 },
];

export const E2E_PACKING_REORDER_ITEMS = [
  { name: "Item A", isLabel: false, done: false, position: 0 },
  { name: "Item B", isLabel: false, done: false, position: 1 },
  { name: "Item C", isLabel: false, done: false, position: 2 },
];

export const E2E_MANAGE_DOC = {
  name: "E2E Manage Doc",
  kind: "pdf",
  size: "0.3 MB",
  url: "https://example.com/manage-doc.pdf",
};
