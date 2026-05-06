import { SidebarNav } from "@/components/packt/sidebar-nav";
import { BottomTabBar } from "@/components/packt/bottom-tab-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden lg:flex lg:shrink-0">
        <SidebarNav />
      </div>

      {/* Main content area */}
      <main
        className="flex-1 overflow-y-auto scroll-thin pb-14 lg:pb-0"
        id="main-content"
      >
        {children}
      </main>

      {/* Mobile bottom tab bar — hidden on desktop */}
      <BottomTabBar />
    </div>
  );
}
