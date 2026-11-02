import { ArrivoBrand } from "@/components/arrivo/arrivo-brand";

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <div className="flex w-full max-w-sm flex-col gap-12">
        <div className="flex justify-center">
          <ArrivoBrand size={80} />
        </div>
        <div className="rounded-2xl p-8" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
          {children}
        </div>
      </div>
    </main>
  );
}
