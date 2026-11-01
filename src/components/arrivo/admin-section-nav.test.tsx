import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import * as navigation from "next/navigation";
import { AdminSectionNav } from "./admin-section-nav";

describe("AdminSectionNav", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("links Overview, Users and Activity and marks Users current on its path", () => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/admin/users");
    render(<AdminSectionNav />);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/admin/activity");
    expect(screen.getByRole("link", { name: "Activity" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/admin/overview");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Overview", "Users", "Activity"]);
  });

  it("marks Overview current on its path", () => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/admin/overview");
    render(<AdminSectionNav />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveAttribute("aria-current");
  });

  it("marks Activity current on its path", () => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/admin/activity");
    render(<AdminSectionNav />);
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveAttribute("aria-current");
  });
});
