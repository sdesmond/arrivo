import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { UpdateNotice } from "./update-notice";

const update = { version: "1.0.0", url: "https://github.com/sdesmond/arrivo/releases/tag/v1.0.0" };
const fetchMock = vi.fn();

async function renderSettled() {
  const view = render(<UpdateNotice />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  // Let the response chain finish before asserting that nothing appeared.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return view;
}

describe("UpdateNotice", () => {
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("links to the release in a new tab", async () => {
    fetchMock.mockResolvedValue(Response.json({ update }));
    render(<UpdateNotice />);
    const link = await screen.findByRole("link", { name: "Version 1.0.0 available (opens in a new tab)" });
    expect(link).toHaveAttribute("href", update.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/update-status", expect.objectContaining({ cache: "no-store" }));
  });

  it.each([
    ["there is no update", () => Promise.resolve(Response.json({ update: null }))],
    ["the request fails", () => Promise.resolve(Response.json({ update }, { status: 500 }))],
    ["the request is rejected", () => Promise.reject(new Error("offline"))],
    ["the body is not JSON", () => Promise.resolve(new Response("<html>"))],
    ["the body is null", () => Promise.resolve(Response.json(null))],
    ["the update is not an object", () => Promise.resolve(Response.json({ update: "1.0.0" }))],
    ["the version is missing", () => Promise.resolve(Response.json({ update: { url: update.url } }))],
    ["the url is missing", () => Promise.resolve(Response.json({ update: { version: "1.0.0" } }))],
  ])("renders nothing when %s", async (_label, respond) => {
    fetchMock.mockImplementation(respond);
    const { container } = await renderSettled();
    expect(container).toBeEmptyDOMElement();
  });

  it("aborts the request on unmount", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const view = render(<UpdateNotice />);
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
});
