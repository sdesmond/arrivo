# Visual reference coverage

User approved five [key-screen references](mockups/index.html), each with desktop/mobile and light/dark variants. User confirmed **specs sufficient for remaining surfaces** on 2026-10-24. Spine-only surfaces inherit existing shared components and require no additional mock. Static references illustrate composition; behavioral verification belongs to implementation.

| IA surface | Coverage | Reference or inherited pattern |
| --- | --- | --- |
| Bootstrap registration | Spine-only, confirmed | Existing auth-card; EXPERIENCE Flow 1 and State Patterns |
| Sign-in | Spine-only, confirmed | Existing username/password/MFA controls; Flow 1 |
| Account menu | Mocked | [Account menu](mockups/key-settings-entry.html): admin and regular roles. Desktop sidebar account control; mobile existing Profile tab opens same menu. |
| Administration / Overview | Mocked | [Overview](mockups/key-overview.html): narrower read-only metrics, freshness, Refresh, recent activity |
| Users | Mocked | [Users](mockups/key-users.html): ready/pending/expired accounts, row options menus, disabled-action tooltip |
| Add User / setup-link result | Spine-only, confirmed | Username form and share-link pattern; Flow 2. Reset-link result reference illustrates common plain-text URL/copy anatomy, not account-creation state. |
| Account setup | Mocked | [Required password dialog](mockups/key-password-setup.html): fixed username, password fields, no dismissal/app content |
| Generate new setup link / result | Spine-only, confirmed | Same share-link anatomy, existing account target, fresh 24-hour lifecycle; Flow 3 |
| Change admin role confirmation | Spine-only, confirmed | Shared confirmation-dialog and last-admin guard; Flow 4 |
| Delete user confirmation | Spine-only, confirmed | Shared confirmation-dialog with automatic trip outcomes; Flow 5 |
| Reset password / link result | Mocked | [Users alternate state](mockups/key-users.html): generated link dialog, target username, expiry, selectable URL, copy icon |
| Password reset | Spine-only, confirmed | Existing auth-card/password form, existing MFA; Flow 6 |
| CLI admin recovery | Spine-only, confirmed | Native terminal issuance; auth-card/password/MFA setup and existing recovery-code handoff; Flow 6 |
| Activity | Mocked | [Activity](mockups/key-activity.html): shadcn Table, filters, summary batches, pagination and narrow-screen overflow |
| Activity retention setting | Mocked setting; confirmation spine-only, confirmed | [Activity](mockups/key-activity.html) shows duration/Save. Shared confirmation-dialog handles shorter retention; Flow 7. |

`.working/` remains creative audit trail. `mockups/` contains approved references. No external imports or wireframes accompany this run.
