import React from "react";

interface SectionHeadProps {
  title: string;
  count?: string;
  children?: React.ReactNode;
  titleColor?: string;
}

export function SectionHead({ title, count, children, titleColor }: SectionHeadProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2
        style={{
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          fontSize: "calc(18px * var(--font-scale))",
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: titleColor ?? "var(--fg)",
        }}
      >
        {title}
      </h2>
      {count && (
        <span
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "calc(10.5px * var(--font-scale))",
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
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
