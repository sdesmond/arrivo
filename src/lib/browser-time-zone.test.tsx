import { renderToString } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBrowserLocale, useBrowserTimeZone } from "./browser-time-zone";

function Zone() {
  return <span>{useBrowserTimeZone()}</span>;
}

function Locale() {
  return <span>{useBrowserLocale()}</span>;
}

describe("useBrowserLocale", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the browser language on the client", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
    render(<Locale />);
    expect(screen.getByText("en-GB")).toBeInTheDocument();
  });

  it("falls back to en-US when the browser reports no language", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("");
    render(<Locale />);
    expect(screen.getByText("en-US")).toBeInTheDocument();
  });

  it("renders en-US on the server", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
    expect(renderToString(<Locale />)).toContain("en-US");
  });
});

describe("useBrowserTimeZone", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the resolved browser zone on the client", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Tokyo",
    } as Intl.ResolvedDateTimeFormatOptions);
    render(<Zone />);
    expect(screen.getByText("Asia/Tokyo")).toBeInTheDocument();
  });

  it("falls back to UTC when the browser reports no zone", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "",
    } as Intl.ResolvedDateTimeFormatOptions);
    render(<Zone />);
    expect(screen.getByText("UTC")).toBeInTheDocument();
  });

  it("renders UTC on the server", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Tokyo",
    } as Intl.ResolvedDateTimeFormatOptions);
    expect(renderToString(<Zone />)).toContain("UTC");
  });
});
