---
name: feedback-base-ui-not-radix
description: UI primitives are Base UI (@base-ui/react), not Radix — never reference Radix in plans or stories
metadata:
  type: feedback
---

All UI primitive components in this project are backed by `@base-ui/react`, not Radix UI. The `src/components/ui/` components (Dialog, Tabs, etc.) import from `@base-ui/react/*`.

**Why:** The project explicitly chose Base UI over Radix. Referencing Radix behavior (focus management, portal behavior, etc.) in plans or stories is incorrect and confusing.

**How to apply:** When writing stories or plans that reference Dialog, Tabs, Popover, or other primitive behavior, always say "Base UI Dialog" / "@base-ui/react" — never "Radix". Verify the import at the top of `src/components/ui/<component>.tsx` when in doubt.
