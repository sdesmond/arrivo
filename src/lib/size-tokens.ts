/**
 * Icon size constants — base px values for Lucide icon `size` props.
 * Keep in sync with the corresponding --fs-* CSS custom properties in globals.css.
 */
export const IconSize = {
  /** Event chip time/mono metadata icon — matches --fs-chip-meta */
  chipMeta: 11,
  /** Place-row action-bar chip icons — matches --fs-action-chip */
  actionChip: 12,
  /** Day card header stops-count icon — matches --fs-card-sub */
  cardSub: 13,
  /** Place-row trash/delete icon */
  placeAction: 15,
  /** Sidebar nav item icon */
  navItem: 18,
} as const;
