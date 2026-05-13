import React from "react";

interface SectionHeadProps {
  title: string;
  count?: string;
  children?: React.ReactNode;
}

export function SectionHead({ title, count, children }: SectionHeadProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2
        style={{
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          fontSize: 18, fontWeight: 600,
          letterSpacing: "-0.01em", color: "var(--fg)",
        }}
      >
        {title}
      </h2>
      {count && (
        <span
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "10.5px", fontWeight: 500,
            letterSpacing: "0.06em", textTransform: "uppercase",
            color: "var(--fg-4)",
          }}
        >
          {count}
        </span>
      )}
      <span className="flex-1" />
      {children}
    </div>
  );
}
