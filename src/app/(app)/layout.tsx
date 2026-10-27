import { SidebarNav } from "@/components/arrivo/sidebar-nav";
import { BottomTabBar } from "@/components/arrivo/bottom-tab-bar";
import { SyncStatusIndicator } from "@/components/arrivo/sync-status-indicator";
import { ContributorRevocationModal } from "@/components/arrivo/contributor-revocation-modal";
import { InvitationLiveRefresh } from "@/components/arrivo/invitation-live-refresh";
import { MapboxTokenProvider } from "@/components/providers/mapbox-token-provider";
import { isInstanceAdmin } from "@/lib/instance-roles";
import { requireUser } from "@/lib/auth-helpers";
import { getBrowserMapboxToken } from "@/lib/map-helpers";
import { getUserById } from "@/lib/queries";
import { getMyPendingInvitations } from "@/lib/invitations";
import { scheduleActivityMaintenance } from "@/lib/activity-maintenance";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  scheduleActivityMaintenance();
  const [user, pendingInvitations, isAdmin] = await Promise.all([
    getUserById(session.id!),
    getMyPendingInvitations(session.id!),
    isInstanceAdmin(session.id!),
  ]);
  const invitationCount = pendingInvitations.length;

  return (
    // Read per request (this layout is dynamic via requireUser), so the token comes from the runtime env.
    <MapboxTokenProvider
      token={getBrowserMapboxToken({
        MAPBOX_PUBLIC_TOKEN: process.env.MAPBOX_PUBLIC_TOKEN,
        MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN,
      })}
    >
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
        {/* Desktop sidebar — hidden on mobile */}
        <div className="hidden lg:flex lg:shrink-0">
          <SidebarNav isAdmin={isAdmin} user={user} invitationCount={invitationCount} />
        </div>

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto scroll-thin pb-14 lg:pb-0" id="main-content">
          {children}
        </main>

        {/* Mobile bottom tab bar — hidden on desktop */}
        <BottomTabBar isAdmin={isAdmin} />
        <SyncStatusIndicator />
        <InvitationLiveRefresh />
        {/* From the session, not `user` — getUserById returns null for a session whose row is gone
          (a stale cookie against a truncated DB), and this modal still needs the signed-in id. */}
        <ContributorRevocationModal userId={session.id!} />
      </div>
    </MapboxTokenProvider>
  );
}
