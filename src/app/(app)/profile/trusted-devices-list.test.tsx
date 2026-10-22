import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { removeTrustedDevice } = vi.hoisted(() => ({ removeTrustedDevice: vi.fn() }));
vi.mock("./security-actions", () => ({ removeTrustedDevice }));

import { TrustedDevicesList } from "./trusted-devices-list";

const DEVICES = [
  {
    id: "device-1",
    label: "Chrome on macOS",
    lastUsedAt: "2026-10-21T12:00:00.000Z",
    mfaRememberedUntil: "2026-11-20T12:00:00.000Z",
    isCurrent: true,
  },
  { id: "device-2", label: "Safari on iPhone", lastUsedAt: "2026-10-01T08:00:00.000Z", isCurrent: false },
];

describe("TrustedDevicesList", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explains the empty state", () => {
    render(<TrustedDevicesList devices={[]} />);
    expect(screen.getByText("No browsers yet.")).toBeInTheDocument();
  });

  it("lists each browser with last use, this-browser marker and two-factor window", () => {
    render(<TrustedDevicesList devices={DEVICES} />);
    const [current, other] = within(screen.getByRole("list", { name: "Your browsers" })).getAllByRole("listitem");
    expect(current).toHaveTextContent("Chrome on macOS · This browser");
    expect(current).toHaveTextContent("Last used Oct 21, 2026");
    expect(current).toHaveTextContent("Skips two-factor until Nov 20, 2026");
    expect(other).toHaveTextContent("Safari on iPhone");
    expect(other).not.toHaveTextContent("This browser");
    expect(other).not.toHaveTextContent("Skips two-factor");
  });

  it("removes a browser from its labeled button", async () => {
    render(<TrustedDevicesList devices={DEVICES} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Remove Safari on iPhone" }));
    expect(removeTrustedDevice).toHaveBeenCalledWith("device-2");
    expect(screen.getByRole("button", { name: "Remove Chrome on macOS (this browser)" })).toBeInTheDocument();
  });
});
