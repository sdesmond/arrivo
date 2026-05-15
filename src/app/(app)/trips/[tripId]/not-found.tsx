import Link from "next/link";

export default function TripNotFound() {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-8"
      style={{ background: "var(--bg)", color: "var(--fg)" }}
    >
      <h1 className="text-2xl font-semibold">Trip not found</h1>
      <p style={{ color: "var(--fg-muted)" }}>This trip doesn&apos;t exist or you don&apos;t have access.</p>
      <Link href="/trips" className="underline" style={{ color: "var(--accent-brand)" }}>
        Back to trips
      </Link>
    </main>
  );
}
