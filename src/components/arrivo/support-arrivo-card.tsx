"use client";

import { Heart } from "lucide-react";

export interface SupportLink {
  label: string;
  href: string;
}

// Add Ko-fi here once its page exists; the card renders one link per entry.
export const SUPPORT_LINKS: readonly SupportLink[] = [
  { label: "Sponsor on GitHub", href: "https://github.com/sponsors/sdesmond" },
];

export interface SupportArrivoCardProps {
  className?: string;
}

export function SupportArrivoCard({ className }: SupportArrivoCardProps) {
  return (
    <section
      aria-labelledby="support-arrivo-heading"
      className={className}
      style={{
        border: "1px solid var(--line)",
        background: "var(--surface)",
        borderRadius: "var(--radius)",
        padding: "1rem",
      }}
    >
      <h2 id="support-arrivo-heading" className="font-semibold text-fg">
        Support Arrivo
      </h2>
      <p className="mt-1" style={{ color: "var(--fg-3)", fontSize: "calc(13px * var(--font-scale))" }}>
        Arrivo is free, open-source software built by an independent developer. If it&apos;s useful to you and the
        people you travel with, a sponsorship helps fund new features, fixes and maintenance.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUPPORT_LINKS.map(({ label, href }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 font-medium"
            style={{
              border: "1px solid var(--line-strong)",
              color: "var(--accent-ink)",
              background: "var(--accent-soft)",
              fontSize: "calc(14px * var(--font-scale))",
            }}
          >
            <Heart aria-hidden="true" size={16} strokeWidth={1.5} />
            {label}
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ))}
      </div>
    </section>
  );
}
