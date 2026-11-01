import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const { saveActivityRetentionPolicy, refreshActivityRetention } = vi.hoisted(() => ({
  saveActivityRetentionPolicy: vi.fn(),
  refreshActivityRetention: vi.fn(),
}));
vi.mock("@/app/(app)/admin/activity/actions", () => ({ saveActivityRetentionPolicy, refreshActivityRetention }));
import { ActivityRetentionSettings } from "./activity-retention-settings";
const initial = { status: "ok" as const, days: 90 as const, expired: true, checkedAt: "2026-10-26T12:00:00.000Z" };
async function selectDays(days: number) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Activity retention" }));
  await user.click(await screen.findByRole("option", { name: `${days} days` }));
  return user;
}
describe("ActivityRetentionSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshActivityRetention.mockResolvedValue(initial);
  });
  it("shows saved policy separately from pending cleanup", () => {
    render(<ActivityRetentionSettings initial={initial} />);
    expect(screen.getByText("Saved retention: 90 days")).toBeInTheDocument();
    expect(screen.getByText(/Expired activity pending cleanup/)).toBeInTheDocument();
  });
  it("does not save selection automatically and cancel preserves policy", async () => {
    render(<ActivityRetentionSettings initial={initial} />);
    const user = await selectDays(30);
    expect(saveActivityRetentionPolicy).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save retention" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(saveActivityRetentionPolicy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save retention" })).toHaveFocus());
  });
  it("confirms shortening, acknowledges save without inferring cleanup", async () => {
    saveActivityRetentionPolicy.mockResolvedValue({ status: "ok", days: 30 });
    render(<ActivityRetentionSettings initial={initial} />);
    const user = await selectDays(30);
    await user.click(screen.getByRole("button", { name: "Save retention" }));
    await user.click(screen.getByRole("button", { name: "Confirm retention change" }));
    await screen.findByText("Retention saved: 30 days");
    expect(saveActivityRetentionPolicy).toHaveBeenCalledWith(30, 90);
    expect(screen.queryByText(/No expired activity found/)).not.toBeInTheDocument();
  });
  it("saves lengthening without confirmation", async () => {
    saveActivityRetentionPolicy.mockResolvedValue({ status: "ok", days: 180 });
    render(<ActivityRetentionSettings initial={initial} />);
    const user = await selectDays(180);
    await user.click(screen.getByRole("button", { name: "Save retention" }));
    await screen.findByText("Retention saved: 180 days");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("retains failed selection, refreshes saved baseline and renews confirmation", async () => {
    saveActivityRetentionPolicy.mockResolvedValue({ status: "stale" });
    refreshActivityRetention.mockResolvedValue({ ...initial, days: 180 });
    render(<ActivityRetentionSettings initial={initial} />);
    const user = await selectDays(30);
    await user.click(screen.getByRole("button", { name: "Save retention" }));
    await user.click(screen.getByRole("button", { name: "Confirm retention change" }));
    await screen.findByText(/Policy changed elsewhere/);
    expect(screen.getByRole("combobox")).toHaveTextContent("30 days");
    await screen.findByText("Saved retention: 180 days");
    await user.click(screen.getByRole("button", { name: "Save retention" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
  it.each(["forbidden", "unavailable", "invalid"])("shows safe %s save errors", async (status) => {
    saveActivityRetentionPolicy.mockResolvedValue({ status });
    render(<ActivityRetentionSettings initial={initial} />);
    const user = await selectDays(180);
    await user.click(screen.getByRole("button", { name: "Save retention" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("combobox")).toHaveTextContent("180 days");
  });
  it("refresh shows timestamped absence and unavailable on failure", async () => {
    refreshActivityRetention
      .mockResolvedValueOnce({ ...initial, expired: false })
      .mockRejectedValueOnce(new Error("private"));
    render(<ActivityRetentionSettings initial={initial} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Refresh cleanup status" }));
    await screen.findByText(/No expired activity found at/);
    await user.click(screen.getByRole("button", { name: "Refresh cleanup status" }));
    await screen.findByText("Cleanup status unavailable.");
  });
  it("renders unavailable initial inspection", () => {
    render(<ActivityRetentionSettings initial={{ status: "unavailable" }} />);
    expect(screen.getByText("Cleanup status unavailable.")).toBeInTheDocument();
  });
  it("contains an offline save and refreshes the saved baseline", async () => {
    saveActivityRetentionPolicy.mockRejectedValueOnce(new Error("private"));
    render(<ActivityRetentionSettings initial={initial} />);
    const user = await selectDays(180);
    await user.click(screen.getByRole("button", { name: "Save retention" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save retention. Try again.");
    expect(refreshActivityRetention).toHaveBeenCalledOnce();
  });
});
