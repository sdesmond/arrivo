import { SidebarNav } from "@/components/packt/sidebar-nav";
import { BottomTabBar } from "@/components/packt/bottom-tab-bar";
import { SyncStatusIndicator } from "@/components/packt/sync-status-indicator";
import { ContributorRevocationModal } from "@/components/packt/contributor-revocation-modal";
import { requireUser } from "@/lib/auth-helpers";
import { getUserById } from "@/lib/queries";
import { getMyPendingInvitations } from "@/lib/invitations";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const [user, pendingInvitations] = await Promise.all([
    getUserById(session.id!),
    getMyPendingInvitations(session.email!),
  ]);
  const invitationCount = pendingInvitations.length;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:flex lg:shrink-0">
        <SidebarNav user={user} invitationCount={invitationCount} />
      </div>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto scroll-thin pb-14 lg:pb-0" id="main-content">
        {children}
      </main>

      {/* Mobile bottom tab bar — hidden on desktop */}
      <BottomTabBar />
      <SyncStatusIndicator />
      {/* From the session, not `user` — getUserById returns null for a session whose row is gone
          (a stale cookie against a truncated DB), and this modal still needs the signed-in id. */}
      <ContributorRevocationModal userId={session.id!} />
    </div>
  );
}
