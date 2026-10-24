---
type: ux
status: final
updated: 2026-10-24
sources:
  - ../brainstorm-admin-page/brainstorm-admin-page.md
---

# Self-hosted administration UX

[DESIGN.md](DESIGN.md) governs appearance; [EXPERIENCE.md](EXPERIENCE.md) governs behavior, states, accessibility, and journeys.

[Approved references](mockups/index.html) illustrate account menu, Overview, Users/actions/reset-link result, Activity Table, and mandatory first-time password setup. [Visual coverage](visual-coverage.md) maps every IA surface; user confirmed specs suffice for remaining surfaces.

Shared account menu opens from desktop sidebar username/account control or mobile Profile tab. Everyone gets Settings and Log out; admins additionally get Manage instance. Overview/Users use narrower padded panels; Activity stays wide. Existing side/bottom navigation exits page.

[Decision log](.memlog.md) is canonical. [Source reconciliation](reconcile-brainstorm-admin-page.md) records overrides. Original [validation report](validation-report.md) ([HTML](validation-report.html)) is historical; [follow-up](validation-followup.md) records resolution of eight findings and later accepted changes. [Structure and prose review](editorial-review.md) is complete; all findings applied.

UX contracts only; no runtime implementation or implementation-ready plan. Exact recovery commands/token mechanisms, sole-account upgrade mechanism, audit storage, and stable membership tie handling belong to architecture within confirmed UX outcomes.
