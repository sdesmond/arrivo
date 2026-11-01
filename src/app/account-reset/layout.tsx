import type { Metadata } from "next";
import { ArrivoBrand } from "@/components/arrivo/arrivo-brand";
interface PasswordResetLayoutProps {
  children: React.ReactNode;
}
export const metadata: Metadata = { title: "Reset password", referrer: "no-referrer", robots: { index: false } };
export default function PasswordResetLayout({ children }: PasswordResetLayoutProps) {
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
