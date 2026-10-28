import type { Metadata } from "next";
import { ArrivoBrand } from "@/components/arrivo/arrivo-brand";

interface AccountSetupLayoutProps {
  children: React.ReactNode;
}

// The meta tag backs the Referrer-Policy header that src/proxy.ts sets.
export const metadata: Metadata = { title: "Account setup", referrer: "no-referrer", robots: { index: false } };

export default function AccountSetupLayout({ children }: AccountSetupLayoutProps) {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
      >
        <ArrivoBrand size={36} className="mb-6" />
        {children}
      </div>
    </main>
  );
}
