import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminSectionNav } from "./admin-section-nav";

describe("AdminSectionNav", () => {
  it("enables only Users and announces the active section", () => {
    render(<AdminSectionNav />);
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
  });
});
