import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import * as navigation from "next/navigation";
import userEvent from "@testing-library/user-event";

const { ReadonlyURLSearchParams } = await vi.importActual<typeof navigation>("next/navigation");
const { signOutAction } = vi.hoisted(() => ({ signOutAction: vi.fn() }));
const fetchRole = vi.fn<typeof fetch>();
const roleResponse = (isAdmin: boolean) => Response.json({ isAdmin });
vi.mock("@/app/(auth)/actions", () => ({ signOutAction }));
import { AccountMenu } from "./account-menu";

describe("AccountMenu", () => {
  it("requests current authority with an uncached authenticated GET", async () => {
    render(<AccountMenu isAdmin={false} trigger={<button>Account</button>} side="top" />);
    await waitFor(() =>
      expect(fetchRole).toHaveBeenCalledWith("/api/users/me/app-role", {
        cache: "no-store",
        credentials: "same-origin",
      })
    );
  });
  it.each([
    ["HTTP failure", () => new Response("unavailable", { status: 503 })],
    ["invalid JSON", () => new Response("not-json")],
    ["null JSON", () => Response.json(null)],
    ["missing role flag", () => Response.json({})],
    ["non-boolean role flag", () => Response.json({ isAdmin: "true" })],
  ] as const)("hides management on %s", async (_label, response) => {
    fetchRole.mockResolvedValue(response());
    render(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    screen.getByRole("button", { name: "Account" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Manage app" })).not.toBeInTheDocument());
  });
  it("ignores an older role response after navigating to a new pathname", async () => {
    const pathname = vi.spyOn(navigation, "usePathname").mockReturnValue("/trips");
    let resolveOldCheck!: (value: Response) => void;
    fetchRole
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveOldCheck = resolve;
        })
      )
      .mockResolvedValueOnce(roleResponse(false));
    const { rerender } = render(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    pathname.mockReturnValue("/profile");
    rerender(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    await waitFor(() => expect(fetchRole).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveOldCheck(roleResponse(true));
    });
    screen.getByRole("button", { name: "Account" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("menuitem", { name: "Manage app" })).not.toBeInTheDocument();
  });

  it.each([
    ["", "view=spending"],
    ["view=spending", "view=spending&range=last-year"],
  ])("refreshes authority on same-path query navigation from %s to %s", async (initialSearch, nextSearch) => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/travel-history");
    const searchParams = vi
      .spyOn(navigation, "useSearchParams")
      .mockReturnValue(new ReadonlyURLSearchParams(initialSearch));
    let resolveCurrentCheck!: (value: Response) => void;
    fetchRole.mockResolvedValueOnce(roleResponse(true)).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveCurrentCheck = resolve;
      })
    );
    const { rerender } = render(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    screen.getByRole("button", { name: "Account" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Manage app" })).toBeInTheDocument();
    searchParams.mockReturnValue(new ReadonlyURLSearchParams(nextSearch));
    rerender(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    expect(screen.queryByRole("menuitem", { name: "Manage app" })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchRole).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveCurrentCheck(roleResponse(false));
    });
    expect(screen.queryByRole("menuitem", { name: "Manage app" })).not.toBeInTheDocument();
  });

  it("ignores a late admin response from the previous query on the same pathname", async () => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/travel-history");
    const searchParams = vi.spyOn(navigation, "useSearchParams").mockReturnValue(new ReadonlyURLSearchParams());
    let resolvePreviousCheck!: (value: Response) => void;
    fetchRole
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolvePreviousCheck = resolve;
        })
      )
      .mockResolvedValueOnce(roleResponse(false));
    const { rerender } = render(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    searchParams.mockReturnValue(new ReadonlyURLSearchParams("view=spending"));
    rerender(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    await waitFor(() => expect(fetchRole).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolvePreviousCheck(roleResponse(true));
    });
    screen.getByRole("button", { name: "Account" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("menuitem", { name: "Manage app" })).not.toBeInTheDocument();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchRole);
    fetchRole.mockResolvedValue(roleResponse(false));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("shows Settings and Log out for members without management", async () => {
    render(<AccountMenu isAdmin={false} trigger={<button>Account</button>} side="top" />);
    screen.getByRole("button", { name: "Account" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Manage app" })).not.toBeInTheDocument();
  });
  it("shows management for admins and restores focus on Escape", async () => {
    fetchRole.mockResolvedValue(roleResponse(true));
    render(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    const trigger = screen.getByRole("button", { name: "Account" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByRole("menuitem", { name: "Manage app" })).toHaveAttribute("href", "/admin");
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item).toHaveClass("cursor-pointer");
    }
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it("submits the sign-out action from Log out", async () => {
    render(<AccountMenu isAdmin={false} trigger={<button>Account</button>} side="top" />);
    screen.getByRole("button", { name: "Account" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.click(screen.getByRole("menuitem", { name: "Log out" }));
    await waitFor(() => expect(signOutAction).toHaveBeenCalled());
  });
  it("drops stale admin authority on the next navigation", async () => {
    const pathname = vi.spyOn(navigation, "usePathname").mockReturnValue("/trips");
    fetchRole.mockResolvedValueOnce(roleResponse(true)).mockResolvedValueOnce(roleResponse(false));
    const { rerender } = render(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    await waitFor(() => expect(fetchRole).toHaveBeenCalledTimes(1));
    screen.getByRole("button", { name: "Account" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Manage app" })).toBeInTheDocument();
    pathname.mockReturnValue("/profile");
    rerender(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    await waitFor(() => expect(fetchRole).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("menuitem", { name: "Manage app" })).not.toBeInTheDocument();
  });
  it("hides management when the role check fails", async () => {
    fetchRole.mockRejectedValue(new Error("unavailable"));
    render(<AccountMenu isAdmin trigger={<button>Account</button>} side="bottom" />);
    screen.getByRole("button", { name: "Account" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Manage app" })).not.toBeInTheDocument());
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
  });
  it.each([true, false])("ignores a role check that settles after unmount (success: %s)", async (success) => {
    let resolveCheck!: (value: Response) => void;
    let rejectCheck!: (reason: Error) => void;
    fetchRole.mockReturnValue(
      new Promise<Response>((resolve, reject) => {
        resolveCheck = resolve;
        rejectCheck = reject;
      })
    );
    const { unmount } = render(<AccountMenu isAdmin trigger={<button>Account</button>} side="top" />);
    unmount();
    await act(async () => {
      if (success) resolveCheck(roleResponse(true));
      else rejectCheck(new Error("unavailable"));
    });
    expect(screen.queryByRole("button", { name: "Account" })).not.toBeInTheDocument();
  });
});
