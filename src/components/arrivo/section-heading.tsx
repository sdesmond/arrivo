interface SectionHeadingProps {
  children: React.ReactNode;
}

export function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <div
      className="px-2.5 pb-1 pt-3"
      style={{
        fontFamily: "var(--font-mono-family, ui-monospace)",
        fontSize: "calc(10.5px * var(--font-scale))",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--fg-4)",
      }}
    >
      {children}
    </div>
  );
}
