import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import * as navigation from "next/navigation";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/(auth)/actions", () => ({ signOutAction: vi.fn() }));
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ isAdmin: false }))
  )
);
afterEach(() => vi.unstubAllGlobals());

import { BottomTabBar } from "./bottom-tab-bar";

describe("BottomTabBar", () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(["/trips", "/trips/trip-1"])("keeps Trips active at %s", (pathname) => {
    vi.spyOn(navigation, "usePathname").mockReturnValue(pathname);
    render(<BottomTabBar />);
    expect(screen.getByRole("link", { name: "Trips" })).toHaveAttribute("aria-current", "page");
  });
  it("keeps the Profile trigger active within personal settings", () => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/profile");
    render(<BottomTabBar />);
    expect(screen.getByRole("button", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });
  it("renders the Trips tab", () => {
    render(<BottomTabBar />);
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("leaves Trips inactive on other routes", () => {
    render(<BottomTabBar />);
    const tripsLink = screen.getByRole("link", { name: /trips/i });
    expect(tripsLink).not.toHaveAttribute("aria-current");
  });

  it("renders all 5 tabs", () => {
    render(<BottomTabBar />);
    expect(screen.getByText("Trips")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("links the History tab to /travel-history", () => {
    render(<BottomTabBar />);
    expect(screen.getByRole("link", { name: /history/i })).toHaveAttribute("href", "/travel-history");
  });
});

it("opens account menu from Profile instead of linking directly", async () => {
  render(<BottomTabBar />);
  expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
  screen.getByRole("button", { name: "Profile" }).focus();
  await userEvent.keyboard("{Enter}");
  expect(screen.getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
});
