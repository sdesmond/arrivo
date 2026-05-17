---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: []
session_topic: 'What belongs on the Packt profile/settings page — complete feature definition'
session_goals: 'Walk away with a clear, complete picture of everything the page should contain, well enough defined to build from'
selected_approach: 'ai-recommended'
techniques_used: ['Mind Mapping', 'Role Playing', 'Morphological Analysis']
ideas_generated: [20]
session_active: false
workflow_completed: true
---

# Brainstorming Session Results

**Facilitator:** Spencer
**Date:** 2026-05-17

## Session Overview

**Topic:** What belongs on the Packt profile/settings page — complete feature definition
**Goals:** Walk away with a clear, complete picture of everything the page should contain, well enough defined to build from

### Session Setup

Focus is on the Packt profile/settings page. The sidenav fix (replacing hard-coded user data with the logged-in user) and adding a navigation link are prerequisites — the main deliverable is a complete definition of what belongs on the profile page itself.

## Technique Selection

**Approach:** AI-Recommended Techniques
**Analysis Context:** Feature discovery for a travel planning app profile page

**Recommended Techniques:**
- **Mind Mapping:** Rapidly branch all categories from "Profile Page" to surface the full landscape before committing to anything
- **Role Playing:** Inhabit different traveler archetypes to surface needs generic thinking misses
- **Morphological Analysis:** Map ideas against key dimensions to find gaps and produce a structured, exhaustive spec

**AI Rationale:** This is a coverage problem — the risk is anchoring on standard profile pages and missing what's unique to a travel planning app. The sequence moves from broad exploration → persona-driven discovery → systematic gap-filling.

## Technique Execution Results

### Mind Mapping

Branched outward from "Profile Page" across six categories. Key discovery: Packt has a distinct "traveler data" layer (loyalty numbers, passport, wishlist) that generic profile pages don't have.

**Ideas generated:**
- Display name, profile photo, email
- Frequent flyer/loyalty numbers
- Destination wishlist
- Travel documents (passport, expiry, KTN/Global Entry)
- Date/time format, default currency, distance units
- Theme (light/dark/system) — currently homeless on the home page title
- Event reminders, user-set reminders, timing defaults, push toggle (scoped to future)

**Scoping decisions made:**
- Home airport: no consumer in the app yet, deferred
- Notification categories: no app-level categories yet, deferred
- Data/privacy standalone section: folded into Account

### Role Playing

Inhabited three traveler archetypes. Key discovery: the Family Organizer persona unlocked an entirely new branch — saved companions — that Mind Mapping missed.

**Business Traveler insights:**
- Loyalty numbers need two surfaces: edit in profile, quick reference in trip view
- Home airport pre-fill only makes sense with booking integration (deferred)

**Family Organizer insights:**
- Saved travelers list: name, age, key preferences, Packt username for trip sharing
- Travel documents needed on companions too, not just the main user

**Solo Adventurer insights:**
- No unique profile page needs surfaced
- Dietary restrictions scoped out — no app consumer for the data

### Morphological Analysis

Stress-tested all ideas against three dimensions: app consumption, missing homes, and page organization.

**Gap findings:**
- Destination wishlist has no consumer — kept as useful reference data anyway
- Notifications settings are premature (notifications don't exist yet) — removed from page scope
- Account section (sessions, delete) confirmed as bottom-of-page, visually separated

## Idea Organization and Prioritization

### Complete Profile Page Spec

**Section 1 — Identity**
- Display name (editable)
- Profile photo (upload or pull from OAuth provider)
- Email address (read-only if OAuth, editable otherwise)

**Section 2 — Traveler**
- Loyalty/frequent flyer numbers (list: program name + number)
- Passport & travel documents (passport number, expiry date, nationality, KTN/Global Entry/TSA PreCheck)
- Destination wishlist (list of saved places, no consumer yet — pure reference)

**Section 3 — Companions**
- Saved travelers: name, age, passport/travel docs, Packt username (optional, for trip sharing)

**Section 4 — Preferences**
- Date & time format (MM/DD/YYYY vs DD/MM/YYYY, 12h vs 24h)
- Default currency
- Distance units (imperial/metric)

**Section 5 — Appearance**
- Theme: light / dark / system (moved from current home page location)

**Section 6 — Account** *(bottom, visually separated)*
- Change password / connected OAuth accounts
- Active sessions (sign out all devices)
- Delete account

### Build Priority

**Tier 1 — Quick wins**
Identity, Preferences, Appearance (theme relocation), Account

**Tier 2 — Moderate complexity**
Loyalty numbers, Passport/travel documents, Destination wishlist

**Tier 3 — Feature-complete**
Saved companions (with travel docs and Packt user linking)

### Deferred / Scoped Out

| Item | Reason |
|---|---|
| Notification settings | Notifications feature doesn't exist yet |
| Home airport | No booking integration to consume it |
| Dietary restrictions | No app consumer |
| Notification categories | No app-level item categories |
| Trip cloning | Belongs on trip card/detail, not profile |
| Social sharing | Future feature |

### Surface Insight (Not Profile Page)

**Loyalty numbers in trip view:** Profile is the source of truth for editing, but loyalty numbers should also be surfaced contextually inside trip planning (e.g., inline on flight/hotel items, or a "travel wallet" panel). Two surfaces, one data model.

## Session Summary

**20 ideas** generated across 3 techniques. The session produced a complete, prioritized spec ready to hand to a developer. The biggest unexpected discovery was the **Saved Companions** feature — surfaced only through the Family Organizer persona, it has significant implications for future trip-sharing and collaboration features.

The profile page doubles as the **social graph seed** for Packt: "people I travel with" stored here enables one-tap trip sharing without requiring a full follow/friend system.
