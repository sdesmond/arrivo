interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
      >
        {children}
      </div>
    </main>
  );
}
