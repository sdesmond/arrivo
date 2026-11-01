import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const actions = vi.hoisted(() =>
  Object.fromEntries(
    [
      "refreshVersion",
      "refreshDatabase",
      "refreshStorage",
      "refreshUploadBytes",
      "refreshUsers",
      "refreshAdmins",
      "refreshPending",
      "refreshTrips",
      "refreshDocuments",
      "refreshFailedSignIns",
      "refreshAdminActions",
    ].map((name) => [name, vi.fn()])
  )
);
vi.mock("@/app/(app)/admin/overview/actions", () => actions);
import { OverviewMetrics } from "./overview-metrics";
const checkedAt = "2026-10-31T12:00:00.000Z";
const later = "2026-10-31T12:01:00.000Z";
const numberMetric = { status: "ok", value: 0, checkedAt } as const;
function mount() {
  return render(
    <OverviewMetrics
      version={{ status: "ok", value: "1.0", checkedAt }}
      database={{ status: "ok", value: "Healthy", checkedAt }}
      storage={{ status: "ok", value: "Healthy", checkedAt }}
      uploadBytes={numberMetric}
      users={numberMetric}
      admins={numberMetric}
      pending={numberMetric}
      trips={numberMetric}
      documents={numberMetric}
      failedSignIns={numberMetric}
      adminActions={{ status: "ok", value: [], checkedAt }}
    />
  );
}
const cases = [
  ["Version", "refreshVersion"],
  ["Database", "refreshDatabase"],
  ["Document storage", "refreshStorage"],
  ["Upload storage", "refreshUploadBytes"],
  ["Users", "refreshUsers"],
  ["Admins", "refreshAdmins"],
  ["Pending setup", "refreshPending"],
  ["Trips", "refreshTrips"],
  ["Documents", "refreshDocuments"],
  ["Failed sign-ins (24 hours)", "refreshFailedSignIns"],
  ["Recent admin actions", "refreshAdminActions"],
] as const;
describe("OverviewMetrics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it.each(cases)("connects %s to its own action and updates only that row", async (label, name) => {
    actions[name].mockResolvedValue({ status: "ok", value: name === "refreshAdminActions" ? [] : 7, checkedAt: later });
    const { container } = mount();
    expect(screen.getAllByRole("button")).toHaveLength(11);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: `Refresh ${label}` })));
    expect(actions[name]).toHaveBeenCalledOnce();
    for (const [otherName, action] of Object.entries(actions))
      if (otherName !== name) expect(action).not.toHaveBeenCalled();
    const row = screen.getByText(label, { exact: true }).parentElement!;
    expect(within(row).getByText(/^Checked/)).toHaveAttribute("datetime", later);
    expect(container.querySelectorAll(`time[datetime="${checkedAt}"]`)).toHaveLength(10);
    expect(container.querySelector("dl")).toHaveClass("grid");
  });
  it("keeps other rows usable during a pending user count refresh", () => {
    actions.refreshUsers.mockReturnValue(new Promise(() => {}));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Refresh Users" }));
    expect(screen.getByRole("button", { name: "Refresh Users" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Refresh Admins" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Refresh Pending setup" })).toBeEnabled();
  });
});
