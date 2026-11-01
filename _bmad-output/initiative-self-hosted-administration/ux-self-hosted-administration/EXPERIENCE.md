---
name: Arrivo self-hosted administration
status: final
updated: 2026-10-27
sources:
  - ../brainstorm-admin-page/brainstorm-admin-page.md
  - .memlog.md
---

# Self-hosted administration experience

## Foundation

Responsive web for private self-hosted consumer travel data, using existing Arrivo settings wrappers and shadcn/Base UI primitives. [DESIGN.md](DESIGN.md) owns appearance; this document owns behavior. [Brainstorming intent](../brainstorm-admin-page/brainstorm-admin-page.md) establishes scope; subsequent decisions in [.memlog.md](.memlog.md) resolve or override it. Named protagonists are illustrative, not additional product requirements.

Instance management is admin-only on desktop and mobile. Admin authority does not grant access to private trips. Current permission is checked on navigation and every action; stale UI never authorizes a mutation. No offline writes or unauthenticated web recovery bypass. [Approved visual references](mockups/index.html) illustrate shared component composition; [visual coverage](visual-coverage.md) records states covered.

Sign-in uses **username and password only**, followed by existing MFA when applicable. Email is absent from account setup, sign-in, and trip sharing. Username is distinct from display name; inherit `src/lib/username.ts` normalization/validation: trim/lowercase, case-insensitive uniqueness, 3–30 characters, letters/numbers/dots/dashes/underscores, starting with letter or number. Profile can change username. Trip invitations and collaborator membership follow account ID, so renaming does not transfer them to another account.

Admin creates account immediately with supplied username and no password; account owns username from creation. Manually shared first-time link grants setup-only access. Mandatory password dialog blocks regular app until successful save. Regeneration targets same account, never creates duplicate, and invalidates prior link. Account can be deleted before first login. Link Lifecycles owns expiry, resumption, and invalidation rules.

Account setup links are distinct from existing trip-sharing invitations, whose user-ID binding, expiry, and rescinding behavior remain unchanged. See Link Lifecycles for account setup rules.

## Information Architecture

Shared account menu contains **Settings** and **Log out** for everyone, plus admin-only **Manage app**. No standalone logout button, settings-heading administration link, or separate global administration navigation item. Manage app opens Overview, Users, and Activity in settings-style subsection layout. Activity uses available width; Overview and Users use padded, narrower panels. Retention is within Activity. Existing side/bottom navigation exits page; no Back to settings link.

Desktop menu trigger is existing sidebar username/account control. Mobile **Profile** tab opens same menu for all users. [Account-menu reference](mockups/key-settings-entry.html) shows admin and regular-user menu contents.

| Surface | Entry / return | Journey |
| --- | --- | --- |
| First-run admin setup | Fresh-instance entry → `/setup` / authenticated app | Flow 1 |
| Sign-in | Existing auth entry / authenticated app | Username/password, then applicable MFA; Flow 1 |
| Account menu | Desktop sidebar account control or mobile Profile tab / dismiss to same context | Settings and Log out for everyone; admin management entry; Flows 1, 8 |
| Administration / Overview | Admin-only account-menu item / existing side or bottom navigation | Flow 8 |
| Users | Administration navigation | Creation, setup status, link regeneration, role changes, deletion, recovery; Flows 2–6 |
| Add User / setup-link result | Add User in Users / Users | Immediately create account; issue manually shared setup link; Flow 2 |
| Account setup | Shared setup link / mandatory non-dismissable password dialog | Setup-only access for existing account; regular app unavailable until password saved; Flow 2 |
| Generate new setup link / result | Existing account with unfinished setup / same account | Fresh link for same account, replacing old; Flow 3 |
| Change admin role confirmation | User action / same list | Flow 4 |
| Delete user confirmation | User action / same list | Flow 5 |
| Reset password / link result | User action / same user | Flow 6 |
| Password reset | Shared reset link / fresh sign-in | Flow 6 |
| CLI admin recovery | Trusted terminal → browser recovery → fresh sign-in | Flow 6 |
| Activity | Instance-management section navigation | Flow 7 |
| Activity retention setting | Activity / history | Flow 7 |

[Overview](mockups/key-overview.html), [Users and reset-link result](mockups/key-users.html), [Activity table](mockups/key-activity.html), and [mandatory password setup](mockups/key-password-setup.html) are approved references. [Visual coverage](visual-coverage.md) maps every surface; user confirmed specs suffice for remaining spine-only surfaces. Link results replace originating forms within one dialog; never stack modals. Users has no search, pagination, or bulk actions. Activity retains actor/type/date filters and pagination.

## Voice and Tone

Concise, impersonal settings copy; omit “We.” Name affected identity and concrete consequences. Creation, copying, saving, cleanup, and delivery are distinct outcomes. Keep lifecycle rules in contract rather than repeating them as dialog instructions. Do not show advice about changing username later in Settings. Disabled reasons belong in tooltips, not inline explanations; retain concise operational errors and destructive confirmations.

| Context | Copy |
| --- | --- |
| User creation action | “Add User” |
| Admin password assistance | “Reset password” generates link; dialog: “Password reset link created. Share this link.” / “Copy link.” No password-changed claim at issuance. |
| Account creation result | “Account created. Share this setup link.” |
| Existing account | “User already exists.” |
| Wrong signed-in account | “Sign out to continue setup.” / “Sign out and continue” |
| Link lifecycle | “Expires {date} at {time}.” Include timezone; explain used/expired/replaced states as applicable. |
| Expired first-time link | “Setup link expired.” Action: “Generate new link.” Account remains visible. |
| URL visibility | Plain selectable URL text with adjacent copy icon; omit copy-before-closing instructions. Lost-result replacement remains lifecycle behavior. |
| Clipboard | “Link copied.” / “Couldn't copy link. Select and copy manually.” |
| Last admin | Tooltip: “Make another user an admin first.” No inline “Last admin” label. |
| Account deletion | “Delete account” / “This can't be undone.” Explain automatic trip outcomes. |
| Shorter retention | “Activity older than {days} days will be permanently deleted.” |
| Failure / uncertain result | “Couldn't save. Try again.” / “Couldn't confirm result. Refresh before retrying.” |
| Closed registration / unknown health | “Ask an admin to create your account.” / “Couldn't check document storage.” |

First-run setup uses “Welcome to Arrivo!” and “Let's get your admin account set up.” Submit action is “Create admin account”. Focus Username on entry. Setup has no “Already set up?” text or sign-in link. Stale setup submissions show “Setup is already complete. Sign in to continue.” Initialized installations expose no signup navigation.

## Component Patterns

Visual contracts live in DESIGN.md.Components; token references resolve against that file.

| Component | Behavioral delta |
| --- | --- |
| account-menu | Desktop account control or mobile Profile tab opens shadcn DropdownMenu. Settings navigates to personal settings; Manage app opens admin Overview; Log out performs existing sign-out action. Enter/Space opens menu, arrow keys traverse, Escape dismisses and restores trigger focus; menu closes on selection. Recheck role before entry/actions; non-admins never see management item. |
| settings-shell | Announce heading; retain personal theme/font preference. Exit through existing side/bottom navigation; no Back to settings link. Warn before leaving unsaved input. |
| section-navigation | One selected panel; arrow keys and orientation match visible horizontal/vertical layout; Home/End supported; selected panel announced. |
| section-field | Persistent label with help/error association; explicit Save; retain input after failure. Retention select uses approved options below. |
| action-button | Verb and target identifiable; pending state prevents duplicate submit; unrelated Enter cannot confirm destructive action; minimum {spacing.target-min} target. Disabled reasons appear in tooltip on hover or keyboard focus, with equivalent touch access that cannot activate disabled action. No inline disabled-reason text. |
| entity-list | Identity, current role, and setup status/expiry remain visible. Keep Add User as section action. When actions crowd, More actions opens shared DropdownMenu for that user; keep existing applicable actions and confirmations. Menu supports keyboard navigation and focus return. Expired setup link has explicit text and Generate new link among available actions; account remains present. Delete account is same action before/after first login, with no separate account-link Rescind. Actions open relevant form or confirmation rather than silently mutating. |
| confirmation-dialog | One modal level; Cancel initially focused for delete/demotion/shorter retention. Show consequences and inline errors; recheck authority/dependencies at submit; restore focus to target or next row. |
| share-link | Full URL appears only in current creation result as selectable plain text followed by Copy link icon button, not textbox. When form becomes result inside dialog, move focus to stable result heading; username, expiry, URL, and copy control follow in logical reading order. Keep focus on copy button after copying; announce result and preserve manual selection on copy failure. No URL retrieval from lists/Activity; losing result requires replacement under Link Lifecycles. Omit long lifecycle/manual-sharing instructions. CLI likewise generates replacement rather than retrieves old URL. |
| status-feedback | Announce confirmed completion politely; persist errors/uncertain results beside action. Read failures offer Retry; ambiguous mutations require reconciliation before resubmit. Never infer success from optimistic display. |
| instance-summary | Read-only values with units and individual freshness; manual Refresh. Partial failure preserves successful values; Checking/Unavailable/Healthy have textual labels. |
| activity-list | shadcn Table with semantic column headers; actor/type/date filters and explicit pagination. Summary-only edit batches and individual security/admin rows follow Activity Rules. Preserve filters/page when returning from actions. Narrow screens keep table in labeled, keyboard-scrollable overflow container; no row expansion, bulk selection, or added sorting controls. |
| auth-card | Reuse existing auth layout for sign-in, bootstrap, reset, and browser CLI recovery; context and errors remain in card. Sign-in labels Username and Password; accept username only, preserve password-manager filling and existing MFA flow. First-time access uses mandatory-password-dialog instead of ordinary dismissable form. |
| registration-form | Bootstrap creates first account only. Admin immediately creates later accounts with validated username and no password, then obtains setup link. Link binds created account ID, never duplicates account or accepts substituted username. Regenerate for same unfinished account, invalidating old link; admin may delete before first login. Wrong signed-in account uses explicit sign-out/continue and revalidation. Recipient must complete mandatory-password-dialog before app access. |
| mandatory-password-dialog | First-time link gives setup-only access and opens dialog with fixed username as non-editable identity text, a required Name field, new password, confirmation, and explicit save action. No username input or rename action; username editable later in Settings only. No close/Cancel button, Escape dismissal, or backdrop dismissal. Trap focus in dialog and make background inert. Regular app data/actions remain inaccessible, including direct routes, until password successfully saved; overlay alone is insufficient. Validation/save errors retain safe input and focus relevant field; announce errors/completion. Password-manager filling and paste supported. If browser closes before save, same valid link reopens setup; opening does not consume link or extend its expiry. Successful password save consumes link. |
| recovery-form | Validate link before credential form. Ordinary reset keeps existing MFA. CLI flow sets password and verifies replacement MFA before atomic completion; unfinished attempt changes nothing. Inherit existing enrollment assistance: QR plus selectable manual setup key, Copy key with manual fallback, whole-code paste/one-time-code autofill and password-manager entry. Verification errors stay associated with code field and retain setup context. See Link Lifecycles. |

### Link Lifecycles

Show expiry date/time in viewer's identified local timezone on link result and valid setup/recovery context; unfinished Users rows also show setup-link expiry. Never display URLs or secrets in Activity.

| Purpose | Lifetime and invalidation | Completion |
| --- | --- | --- |
| Account setup link | Admin creates account immediately, then issues manually shared 24-hour link bound to account ID. Opening/reopening grants setup-only access without consuming link or extending expiry. Resume until password saved or original expiry. Deleting account or regenerating link invalidates old link; there is no separate Rescind. Expiry preserves account with explicit expired-link status and Generate new link. Regeneration gives fresh 24-hour link for same account. | Non-dismissable dialog requires password; successful save consumes link and unlocks regular app. Further link use cannot admit recipient. Reject account/username substitution; subsequent sign-in uses username/password. |
| Ordinary admin-issued reset | One hour; single-use; replacement invalidates earlier unused reset links for same account. | Change password; retain existing MFA; sign out all existing sessions and revoke all trusted devices; fresh sign-in required. |
| CLI admin recovery | Trusted deployment/DB operator generates one-hour, single-use link; replacement invalidates earlier unused CLI recovery links for same account. Covers password loss, MFA loss, or both. | Only after new password and replacement MFA are confirmed: replace credentials, sign out all existing sessions, revoke all trusted devices, then fresh password/MFA sign-in. |

Generating a recovery link alone does not change credentials or sessions. Abandoned/expired CLI recovery leaves existing password, MFA, and sessions unchanged; no partial replacement. Used/expired/replaced links require a new link from issuing admin or trusted CLI as applicable. Copying never creates another link.

Successful CLI recovery also retires old MFA recovery codes and generates replacement codes as part of atomic credential replacement. Show new codes once using existing recovery-code presentation, with Copy, Download, and **I saved these** acknowledgment before returning to fresh sign-in. Never include codes in Activity. Acknowledgment follows completed replacement; it does not postpone credential/session invalidation.

Completing either ordinary password reset or CLI recovery invalidates **all other outstanding password-reset and CLI recovery authorizations for that account**, regardless of purpose, including already-open unfinished flows. Such flows cannot subsequently commit; they require a new authorized link. This completion rule supplements same-purpose invalidation when a replacement link is generated.

### Activity Rules

Capture login/logout; account creation/deletion; setup-link generation/regeneration and password setup completion; trip creation/modification; trip-invitation creation/acceptance/rescinding; password and username changes; admin role changes; reset/recovery link creation and recovery completion; and retention changes. Keep security/admin events separate from routine edit batches.

Activity identifies known actors by account username. Failed-sign-in records show canonical account username when supplied username matches an existing account; otherwise show supplied username with “Unknown account” text. An optional icon supplements this text. Failed sign-in records identify account targeted by attempt; they do not establish who submitted it. Missing username is explicitly unavailable, never fabricated. Activity does not collect or display source IP addresses.

Show activity type in each row and use existing action/type filter for types such as login, trip edit, and profile change. Failed sign-ins belong to same Activity list and filter model. No separate failed-sign-in view or Overview shortcut; Overview failed-login count is read-only.

Routine edits by same actor on same trip form one summary-only “Updated trip” row with first-to-latest edit time range. Every edit extends inactivity window; batch closes after 10 minutes without another edit. Later edits start new batch; different actors/trips stay separate. No expansion or per-edit drill-down.

Ongoing batches appear on page load or Refresh before grouping window closes. Loading or refreshing updates summary end time and ordering; sort by latest edit descending. Date filters include batches whose first-to-latest edit interval overlaps selected range. No live feed required.

For trips outside admin's sharing access, show only actor, action, timestamp(s), and trip ID. No titles, destinations, changed values, collaborator names, or unauthorized trip links. Apply same limits to Overview recent activity, accessibility text, and errors. Summary-only display does not decide underlying storage.

Retention defaults to **90 days**, with **30 / 90 / 180 / 365 days** options and no indefinite choice. Explicit Save; shortening requires permanent-deletion confirmation. Cancel preserves saved policy; failed save starts no cleanup under unsaved policy. After confirmed save, remove older history in background. Saved policy and completed cleanup are separate states. Retention affects activity history, not trips/accounts.

## State Patterns

All web surfaces: resolve data/authority before exposing content; visible {colors.focus} indicator; associated errors; safe input retained after failure. Offline disables mutations and marks existing data stale. Copying displayed URL can work offline without promising current validity. Lost admin authority removes admin content/actions. Unknown mutation result requires authoritative refresh before retry.

| Surface | Loading / empty | Failure or stale state | Confirmed outcome |
| --- | --- | --- | --- |
| First-run admin setup | Resolve durable eligibility before rendering; required Username, Name, Password, Confirm password | Field validation rejects missing or mismatched values; concurrent winner closes setup; stale submission directs to sign-in; missing instance state fails closed | First account admin, signed in to Trips; initialized setup/signup URLs redirect to sign-in without signup links; later accounts admin-created |
| Sign-in | Username/password form, then MFA if required | Invalid username/password uses generic error; email is not an alternate identifier. Preserve existing throttling and MFA timeout/retry behavior with username-based copy | Authenticated entry after required factors |
| Account menu | Closed → open on trigger; role-filtered items | Stale authority removes Manage app; sign-out failure preserves actionable error rather than claiming logout | Settings/Manage app navigation, completed sign-out, or dismissal with trigger focus restored |
| Overview | Per-value loading; zero is valid count | Partial failure labeled Unavailable, never zero/Healthy; stale values retain timestamps | Current metrics and checked times |
| Users | Loading rows; immediately created accounts appear before password setup | Missing/deleted user reconciles list; changed authority removes actions | Simple list distinguishes “Pending setup”; admin can regenerate first-time link or delete account before first login |
| Add User / result | Username form → Creating…; existing unfinished account uses Regenerate first-time link | Invalid/taken username inline; ambiguous creation checks account state before retry; regeneration never duplicates account; copy failure retains URL | Account exists before setup link is used; current generated link shown once, prior link invalid on regeneration; focus moves to result heading |
| Account setup | Validate link, then forced password dialog with fixed username and no old-password request | Unavailable link requires admin replacement; wrong signed-in account requires sign-out/revalidation. Dialog cannot be dismissed; error keeps app blocked. Direct navigation cannot bypass setup. Closed browser can reopen same valid link until original expiry or successful save | Successful password save consumes link and unlocks regular app for existing account; no second account creation |
| Generate new setup link / result | Existing unfinished account and current setup-link state | Failed/unknown generation preserves account, reconciles link state before retry; account deleted or setup completed meanwhile requires refresh | Fresh 24-hour link for same account; old link invalid; current URL shown once for copy/manual share |
| Role confirmation | Current and proposed role | Last-admin/concurrent change blocks and refreshes before new confirmation | Updated role; self-demotion returns to personal settings and removes entry |
| Delete confirmation | Current consequences and last-admin check; available for never-logged-in accounts too | No unauthorized trip details; changed trip outcomes require refreshed review; last admin blocked | Account removed regardless of first-login status; setup links cannot admit deleted account; automatic trip policy applied; acting admin stays signed in unless deleting self |
| Reset password / result | Select Reset password for named account → dialog generating link | Changed authority/missing target blocks; ambiguous issuance reconciles; copy error retains selectable URL | Generated link shown in dialog with target username, one-hour expiry, Copy link, and manual-sharing copy. Focus result heading; no password change until recipient completes flow |
| Password reset | Validate link → password form | Invalid/used/expired/replaced link rejected; invalid context exposes no account details; uncertain completion directs to sign-in/check | Completion per Link Lifecycles |
| CLI admin recovery | Trusted terminal issuance → browser password/MFA setup | Operator access/target failure; unavailable link requires reissue; abandoned/expired attempt unchanged; no web bypass | Atomic completion per Link Lifecycles |
| Activity | Loading rows; no activity/no matching activity | Failed refresh preserves timestamped stale page; private fields withheld | Filtered/paginated history under Activity Rules |
| Activity retention | Load saved duration before editing | Shorter choice prompts confirmation; Cancel unchanged; failed save retains choice and starts no cleanup | Saved duration shown, older history cleaned in background; no premature completion claim |

## Interaction Primitives

- Click/tap and standard keyboard controls; no drag, swipe, hover-only action, or new shortcut required.
- Explicit submission for creation/link generation and settings saves; named confirmation for role, delete, and shorter retention. Account setup has no separate Rescind action.
- Tab order follows reading order. Escape closes ordinary non-pending dialogs, warning on unsaved input where relevant; mandatory first-time password dialog is explicit exception and cannot be dismissed. Closing never implies cancellation of server operation; pending/result handling remains clear.
- Restore focus/context after dialogs. Deletion selects next row/list heading or empty state as appropriate. Link result stays open for copy/manual selection.

## Accessibility Floor

Target WCAG 2.2 AA and project floor of 44×44px for all targets, including close, row actions, tabs, selects, and pagination. Shared primitives do not prove compliance; DESIGN.md defines contrast checks.

- Semantic lists retain identity/action relationships when stacked. Activity retains Table headers and rows inside labeled, keyboard-scrollable horizontal overflow region.
- Dialog title/description, focus containment/restoration, and accessible Escape handling; mobile keyboard cannot obscure active fields/actions. Mandatory first-time password dialog intentionally has no dismissal: announce why password is required, keep background inert, support keyboard completion and clear validation, and never expose background app data while setup is incomplete.
- Persistent labels, linked help/errors; focus first invalid field after submit. Form-to-link-result transition focuses stable result heading; subsequent status/copy feedback does not move focus.
- Password/code fields support paste and password-manager filling. Replacement MFA inherits existing QR plus selectable manual-key setup, accessible Copy key/fallback, whole-code paste, and one-time-code autofill; never require QR scanning or manual transcription as sole path.
- Role, health, and error meanings include words, not color alone. Respect reduced motion and app font scale.
- At 200% text size and 320 CSS px width, essential identities/consequences remain readable without page-level horizontal scrolling. Plain URL text wraps; Activity Table overflow stays within its container.
- Private information stays absent from accessible names, hidden descriptions, tooltips, loading markup, and errors.

## Key Flows

### Flow 1 — First-run admin setup

1. Maya opens a fresh install on desktop or mobile. Root, protected app entry, and sign-in lead automatically to `/setup`; old `/sign-up` links also lead there.
2. Auth card shows “Welcome to Arrivo!” and “Let's get your admin account set up.” Fields follow reading order: Username, Name, Password, Confirm password. All are required; password fields permit paste and password-manager filling.
3. She selects “Create admin account”. Server validates fields and matching passwords before existing transactional bootstrap creates the first admin and marks initialization complete.
4. **Climax:** Maya is signed in to Trips and can reach Manage app from account menu.
5. Setup permanently closes: `/setup` and `/sign-up` redirect to `/sign-in`, with no signup link. Later accounts are admin-created; their password-setup links use a separate route. Subsequent sign-in retains username/password and applicable MFA.

Failure: invalid fields show associated errors without creating an account. Another bootstrap wins first → “Setup is already complete. Sign in to continue.” Reconcile uncertain creation before retry. Missing instance state or DB failure never opens setup. Existing legacy upgrade behavior is outside this flow change.

### Flow 2 — Invitations

1. Maya opens Users, selects Add User, and enters Alex's username. Account is created immediately without password and now owns username; no email is requested.
2. Result provides one-time setup link. Maya reviews expiry, copies link, and forwards it manually. Alex's account already appears in Users with unfinished setup state.
3. Alex opens link on phone without existing password. Setup-only access shows non-dismissable password dialog with fixed username; no trips or other app functions are accessible yet.
4. He enters and confirms password, then saves. Close button, Escape, backdrop, or direct navigation cannot bypass mandatory step.
5. **Climax:** successful password save grants regular app access for existing account. Alex can later sign in with username/password; no additional account is created by link.

Failure: copy fails → manually select same URL. Lost result → generate new first-time link for same account, invalidating old link. Taken username cannot create duplicate account; ambiguous creation reconciles before retry. Closing browser before password save permits resumption until original expiry; successful save consumes link. Expiry leaves account visible with expired-link status and Generate new link. Admin can delete before first login; setup links then cannot admit recipient.

### Flow 3 — Invitations: replace expired first-time link

1. In Users, Maya sees Alex's account still present with unfinished setup and “Setup link expired.”
2. She selects Generate new link; fresh 24-hour link is issued for same account and old link invalidated.
3. She copies result and forwards it manually.
4. **Climax:** Alex resumes mandatory password setup through fresh link; no account was deleted or recreated.

Failure: setup completed or account deleted meanwhile → refresh current account state; do not create duplicate account or restore deleted one. If Maya wants to withdraw access instead, use ordinary Delete account flow; there is no separate Rescind account-link action.

### Flow 4 — Admin management

1. Maya chooses Make admin for Alex and confirms instance authority without private-trip access.
2. Current role updates; later she chooses Remove admin for herself.
3. **Climax:** confirmed self-demotion returns to personal settings and removes Administration entry.

Failure: Alex was demoted concurrently → last-admin guard blocks. Both admin deletion and self-service deletion protect last admin; no optimistic removal.

### Flow 5 — User management

1. Maya selects Delete account for Alex, whether he has logged in or not; confirmation explains irreversible removal and automatic trip outcomes without private names/collaborators.
2. Each owned trip transfers to longest-standing remaining manager, otherwise longest-standing editor; successor becomes manager/creator. Role priority precedes membership duration on that trip. Only viewers or no remaining members → delete trip, viewers lose access.
3. She confirms; joined memberships are removed and sent trip invitations cancelled under existing behavior.
4. **Climax:** Alex leaves Users; qualifying travelers retain trips under new owners; Maya stays signed in.

Failure: changed outcomes require refreshed review; last admin cannot be deleted. This admin-only automatic policy supersedes source reuse of explicit choices; self-service retains existing transfer/delete choices. No successor picker or private-trip access is introduced.

### Flow 6 — Account recovery

1. Alex requests help; Maya selects **Reset password** for him in Users. Dialog generates and shows reset link with expiry and **Copy link**; she copies and shares manually. Generating link alone does not change Alex's password.
2. Alex changes password under ordinary Link Lifecycles and returns to fresh sign-in with existing MFA.
3. **Climax:** access restored; old sessions/trusted devices no longer authorize access.
4. Separately, Maya loses password/MFA. Rowan, trusted server operator, generates CLI recovery link; Maya sets new password and verifies replacement MFA in browser before completion.
5. Completed CLI recovery replaces credentials and retires old MFA recovery codes. Maya sees replacement codes once, copies or downloads them, and selects **I saved these** before fresh sign-in; unfinished recovery attempt leaves account unchanged.

Failure: unavailable/lost link requires replacement through original authority. Copy failure retains result; uncertain completion checks sign-in/state. Completing either reset flow invalidates all other outstanding reset/recovery authorizations for same account, including already-open unfinished flows; those flows cannot commit. No ordinary reset MFA bypass or partially committed CLI recovery. Issuance/completion logged without secrets.

### Flow 7 — Activity audit log

1. Maya opens Activity from Administration navigation, checks activity types, and filters actor/action type/date, paging as needed. Failed sign-ins appear in same list.
2. Routine edits appear as summary-only actor/trip batches under Activity Rules; security/admin events remain individual.
3. She changes retention from 90 to 30 days, reviews permanent-deletion confirmation, and saves.
4. **Climax:** relevant history is readable without private-trip content; saved retention is visible while older history is removed in background.

Failure: Cancel preserves policy; failed save preserves selection and starts no cleanup. Failed refresh retains stale labeled history; no private detail or fake success appears.

### Flow 8 — Instance overview

1. Maya opens desktop username menu or mobile Profile menu and selects Manage app.
2. Overview shows version, DB/document-storage health, user/admin/pending-setup counts, trip/document counts, storage usage, recent admin actions, and failed logins.
3. She checks freshness, refreshes, and follows Activity or Users.
4. **Climax:** instance condition and next controls are clear in familiar settings structure.

Failure: unavailable metric stays Unavailable with Retry; successful values keep timestamps, never substitute zero for missing measurement.

## Responsive & Platform

Activity fills available main-content width; Overview and Users use padded panels capped at {spacing.compact-content-width}. Use {spacing.margin-mobile} padding below 640px and {spacing.margin-desktop} above. At 640px+, vertical navigation uses {spacing.navigation-width} plus {spacing.section-gap}; below, horizontal tabs bring selection into view. Keyboard orientation matches layout. Crowded user actions move into row menu; Activity remains Table with contained horizontal scrolling.

Desktop sidebar remains at 1024px and wider; existing mobile bottom navigation remains below. Its Profile tab opens shared account menu, preserving Settings and Log out plus admin-only Manage app.

Shared dialogs become bottom sheets below 640px and centered modals above. Constrain scrolling above virtual keyboard and keep actions reachable. Auth surfaces retain existing auth-card width. All sizes honor {typography.body.fontSize} and app font scale.

## Inspiration & Anti-patterns

Reference: Arrivo Profile & Settings, Section/Field grouping, explicit saves, shared dialogs, theme/font preferences; retain accessible target sizes and stronger labels. Excluded: email integration/resend, diagnostic logs, suspension, quotas, backup/status controls, registration/upload limits, offline recovery codes, temporary web recovery mode. Audit retention is explicitly approved scope.

## Handoff

Three-lens [validation report](validation-report.md) is historical; [validation-followup.md](validation-followup.md) tracks resolved findings. Approved visual references, primary pairing, mobile Profile menu trigger, and [spine-only coverage](visual-coverage.md) are confirmed. [Structure and prose review](editorial-review.md) is complete; all findings applied. Exact command/token/storage/tie mechanisms belong to architecture within confirmed outcomes.
