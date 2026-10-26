import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEventSummary, ActivityLoadResult, ActivityPage } from "@/data/types";

const mocks = vi.hoisted(() => ({ loadActivityPage: vi.fn() }));
vi.mock("@/app/(app)/admin/activity/actions", () => ({ loadActivityPage: mocks.loadActivityPage }));

import { InstanceActivityViewer } from "./instance-activity-viewer";

const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const event = (id: string, actorUsername: string): ActivityEventSummary => ({
  id,
  type: "sign_in",
  actorUsername,
  occurredAt: "2026-10-25T14:03:07.000Z",
});
const page = (overrides: Partial<ActivityPage> = {}): ActivityPage => ({
  events: [event("e1", "alice")],
  actors: [{ id: ACTOR_ID, username: "alice" }],
  loadedAt: "2026-10-26T12:00:00.000Z",
  ...overrides,
});
const ok = (overrides: Partial<ActivityPage> = {}): ActivityLoadResult => ({ status: "ok", ...page(overrides) });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("InstanceActivityViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/admin/activity");
  });

  it("renders the server-loaded page with its load time and no stale notice", () => {
    render(<InstanceActivityViewer initialQuery={{}} initialPage={page()} />);
    expect(screen.getByRole("table", { name: "Recent instance activity" })).toBeInTheDocument();
    expect(screen.getByText("alice", { selector: "td" })).toBeInTheDocument();
    expect(screen.getByText(/Loaded/)).toHaveTextContent("2026-10-26 06:00:00 MDT");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Older|Newer|Newest/ })).not.toBeInTheDocument();
  });

  it("shows a busy loading state instead of old rows while refreshing, then the new rows", async () => {
    const user = userEvent.setup();
    const pending = deferred<ActivityLoadResult>();
    mocks.loadActivityPage.mockReturnValue(pending.promise);
    render(<InstanceActivityViewer initialQuery={{}} initialPage={page()} />);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    const results = screen.getByRole("region", { name: "Activity results" });
    expect(results).toHaveAttribute("aria-busy", "true");
    expect(within(results).getByRole("status")).toHaveTextContent("Loading activity");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await act(async () => pending.resolve(ok({ events: [event("e2", "carol")] })));
    expect(results).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText("carol", { selector: "td" })).toBeInTheDocument();
    expect(mocks.loadActivityPage).toHaveBeenCalledWith({});
  });

  it("keeps prior rows with a labelled stale alert when a refresh fails, and recovers on Retry", async () => {
    const user = userEvent.setup();
    mocks.loadActivityPage.mockResolvedValueOnce({ status: "unavailable" });
    render(<InstanceActivityViewer initialQuery={{}} initialPage={page()} />);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load activity");
    expect(alert).toHaveTextContent("2026-10-26 06:00:00 MDT");
    expect(screen.getByText("alice", { selector: "td" })).toBeInTheDocument();

    mocks.loadActivityPage.mockResolvedValueOnce(
      ok({ events: [event("e2", "carol")], loadedAt: "2026-10-26T12:05:00.000Z" })
    );
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("carol", { selector: "td" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("treats a thrown action (offline) as unavailable without surfacing its text", async () => {
    const user = userEvent.setup();
    mocks.loadActivityPage.mockRejectedValue(new Error("secret network detail"));
    render(<InstanceActivityViewer initialQuery={{}} initialPage={page()} />);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("alert")).not.toHaveTextContent("secret");
    expect(screen.getByText("alice", { selector: "td" })).toBeInTheDocument();
  });

  it("removes rows and filters when administrator access is lost", async () => {
    const user = userEvent.setup();
    mocks.loadActivityPage.mockResolvedValue({ status: "forbidden" });
    render(<InstanceActivityViewer initialQuery={{ type: "sign_in" }} initialPage={page()} />);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You no longer have administrator access.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Activity filters" })).not.toBeInTheDocument();
    expect(screen.queryByText("alice")).not.toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("reloads with the chosen filter, keeps it in the URL and keeps focus on the control", async () => {
    const user = userEvent.setup();
    mocks.loadActivityPage.mockResolvedValue(ok({ events: [event("e2", "alice")] }));
    render(<InstanceActivityViewer initialQuery={{ cursor: "old" }} initialPage={page()} />);
    await user.click(screen.getByRole("combobox", { name: "Username" }));
    await user.click(await screen.findByRole("option", { name: "alice" }));
    await waitFor(() => expect(mocks.loadActivityPage).toHaveBeenCalledWith({ actorId: ACTOR_ID }));
    await waitFor(() => expect(window.location.search).toBe(`?actor=${ACTOR_ID}`));
    expect(screen.getByRole("combobox", { name: "Username" })).toHaveTextContent("alice");
  });

  it("offers Clear filters, and the empty message names the filters", async () => {
    const user = userEvent.setup();
    mocks.loadActivityPage.mockResolvedValue(ok());
    render(<InstanceActivityViewer initialQuery={{ type: "sign_out" }} initialPage={page({ events: [] })} />);
    expect(screen.getByRole("status")).toHaveTextContent("No activity matches these filters.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(mocks.loadActivityPage).toHaveBeenCalledWith({}));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("says nothing has been recorded when there is no data and no filter", () => {
    render(<InstanceActivityViewer initialQuery={{}} initialPage={page({ events: [] })} />);
    expect(screen.getByRole("status")).toHaveTextContent("No activity recorded yet.");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("shows the field error for an invalid range", () => {
    render(
      <InstanceActivityViewer
        initialQuery={{ from: "2026-10-27T00:00:00.000Z", to: "2026-10-26T00:00:00.000Z" }}
        initialPage={page({ events: [], invalidRange: true })}
      />
    );
    expect(screen.getByText("Enter a start date that is on or before the end date.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No activity matches these filters.");
  });

  it("pages Older, Newer and Newest, carrying the cursor in the URL and moving focus to the results", async () => {
    const user = userEvent.setup();
    mocks.loadActivityPage
      .mockResolvedValueOnce(ok({ events: [event("e2", "bob")], nextCursor: "c2" }))
      .mockResolvedValueOnce(ok({ events: [event("e3", "dan")] }))
      .mockResolvedValueOnce(ok({ events: [event("e2", "bob")], nextCursor: "c2" }))
      .mockResolvedValueOnce(ok({ events: [event("e1", "alice")], nextCursor: "c1" }));
    render(<InstanceActivityViewer initialQuery={{}} initialPage={page({ nextCursor: "c1" })} />);

    await user.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("bob", { selector: "td" })).toBeInTheDocument();
    expect(mocks.loadActivityPage).toHaveBeenLastCalledWith({ cursor: "c1" });
    expect(window.location.search).toBe("?cursor=c1");
    await waitFor(() => expect(screen.getByRole("region", { name: "Activity results" })).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("dan", { selector: "td" })).toBeInTheDocument();
    expect(mocks.loadActivityPage).toHaveBeenLastCalledWith({ cursor: "c2" });
    expect(screen.queryByRole("button", { name: "Older" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Newer" }));
    expect(await screen.findByText("bob", { selector: "td" })).toBeInTheDocument();
    expect(mocks.loadActivityPage).toHaveBeenLastCalledWith({ cursor: "c1" });

    await user.click(screen.getByRole("button", { name: "Newer" }));
    expect(await screen.findByText("alice", { selector: "td" })).toBeInTheDocument();
    expect(mocks.loadActivityPage).toHaveBeenLastCalledWith({});
    expect(window.location.search).toBe("");
    expect(screen.queryByRole("button", { name: "Newer" })).not.toBeInTheDocument();
  });

  it("keeps the cursor stack consistent when Retry follows a failed page change", async () => {
    const user = userEvent.setup();
    mocks.loadActivityPage
      .mockResolvedValueOnce({ status: "unavailable" })
      .mockResolvedValueOnce(ok({ events: [event("e2", "bob")] }))
      .mockResolvedValueOnce(ok({ events: [event("e1", "alice")] }));
    render(<InstanceActivityViewer initialQuery={{}} initialPage={page({ nextCursor: "c1" })} />);

    await user.click(screen.getByRole("button", { name: "Older" }));
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("bob", { selector: "td" })).toBeInTheDocument();
    expect(mocks.loadActivityPage).toHaveBeenLastCalledWith({ cursor: "c1" });

    await user.click(screen.getByRole("button", { name: "Newer" }));
    expect(await screen.findByText("alice", { selector: "td" })).toBeInTheDocument();
    expect(mocks.loadActivityPage).toHaveBeenLastCalledWith({});
  });

  it("offers only Newest after a reload landed on an older page", async () => {
    const user = userEvent.setup();
    mocks.loadActivityPage.mockResolvedValue(ok());
    render(<InstanceActivityViewer initialQuery={{ cursor: "c1" }} initialPage={page()} />);
    expect(screen.queryByRole("button", { name: "Newer" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Newest" }));
    await waitFor(() => expect(mocks.loadActivityPage).toHaveBeenCalledWith({}));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Newest" })).not.toBeInTheDocument());
  });

  it("ignores an answer superseded by a newer request", async () => {
    const user = userEvent.setup();
    const slow = deferred<ActivityLoadResult>();
    mocks.loadActivityPage
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(ok({ events: [event("e3", "dan")] }));
    render(<InstanceActivityViewer initialQuery={{}} initialPage={page()} />);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("dan", { selector: "td" })).toBeInTheDocument();
    await act(async () => slow.resolve(ok({ events: [event("e9", "stale")] })));
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });

  it("uses a 44px minimum for the refresh and paging buttons", () => {
    render(<InstanceActivityViewer initialQuery={{ cursor: "c" }} initialPage={page({ nextCursor: "n" })} />);
    for (const name of ["Refresh", "Newest", "Older"]) {
      expect(screen.getByRole("button", { name }).className).toContain("h-11");
    }
  });
});
